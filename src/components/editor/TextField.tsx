import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import type { DocumentField } from "../../types/document";

interface TextFieldProps {
  field: DocumentField;
  selected: boolean;
  onUpdate: (
    id: string,
    updates: Partial<DocumentField>,
  ) => void;
  onDelete: (id: string) => void;
  onSelect: (id: string) => void;
}

type ResizeDirection =
  | "right"
  | "bottom"
  | "corner";

interface Point {
  x: number;
  y: number;
}

interface ResizeStart {
  clientX: number;
  clientY: number;
  width: number;
  height: number;
}

/*
 * Text field limits.
 */
const MIN_WIDTH = 120;
const MAX_WIDTH = 700;

const MIN_HEIGHT = 36;
const MAX_HEIGHT = 600;

const KEYBOARD_STEP = 1;
const KEYBOARD_FAST_STEP = 10;

/*
 * ============================================================
 * GET THE REAL DOCUMENT COORDINATE CONTAINER
 * ============================================================
 *
 * Important:
 *
 * A resize handle lives inside the field.
 *
 * Therefore:
 *
 * resize handle.offsetParent
 *
 * usually points to the FIELD itself, not the document layer.
 *
 * We deliberately find the field first, then use the field's
 * parent as the actual coordinate system.
 */
const getInteractionContainer = (
  element: HTMLElement,
): HTMLElement | null => {
  const fieldElement =
    element.closest(
      ".document-field, .signature-field, .date-field, .checkbox-field, .name-field, .email-field",
    );

  if (
    fieldElement instanceof HTMLElement
  ) {
    const documentLayerElement =
      fieldElement.parentElement;

    if (
      documentLayerElement instanceof HTMLElement
    ) {
      return documentLayerElement;
    }
  }

  /*
   * Fallback:
   *
   * Walk upward manually and look for a known field layer.
   *
   * Every variable has an explicit HTMLElement type so
   * TypeScript cannot recursively infer `any`.
   */
  let currentElement: HTMLElement | null =
    element.parentElement;

  while (
    currentElement !== null
  ) {
    const classNameValue:
      string =
      typeof currentElement.className ===
      "string"
        ? currentElement.className
        : "";

    if (
      classNameValue.includes(
        "field-layer",
      ) ||
      classNameValue.includes(
        "docx-field-layer",
      ) ||
      classNameValue.includes(
        "image-field-layer",
      )
    ) {
      return currentElement;
    }

    currentElement =
      currentElement.parentElement;
  }

  /*
   * Final fallback.
   */
  const offsetParentElement:
    Element | null =
    element.offsetParent;

  if (
    offsetParentElement instanceof
    HTMLElement
  ) {
    return offsetParentElement;
  }

  return null;
};

/*
 * ============================================================
 * DOCUMENT SCALE
 * ============================================================
 *
 * Converts screen pixels into the internal document coordinate
 * system.
 */
const getDocumentScale = (
  documentLayerElement: HTMLElement,
) => {
  const layerRect =
    documentLayerElement.getBoundingClientRect();

  const internalWidth =
    documentLayerElement.offsetWidth;

  const internalHeight =
    documentLayerElement.offsetHeight;

  const scaleX =
    internalWidth > 0
      ? layerRect.width /
        internalWidth
      : 1;

  const scaleY =
    internalHeight > 0
      ? layerRect.height /
        internalHeight
      : 1;

  return {
    scaleX: Math.max(
      scaleX,
      0.0001,
    ),
    scaleY: Math.max(
      scaleY,
      0.0001,
    ),
  };
};

/*
 * ============================================================
 * CLAMP FIELD POSITION
 * ============================================================
 */
const clampFieldPosition = (
  x: number,
  y: number,
  width: number,
  height: number,
  documentLayerElement: HTMLElement,
): Point => {
  const maximumX =
    Math.max(
      0,
      documentLayerElement.offsetWidth -
        width,
    );

  const maximumY =
    Math.max(
      0,
      documentLayerElement.offsetHeight -
        height,
    );

  return {
    x: Math.min(
      maximumX,
      Math.max(0, x),
    ),

    y: Math.min(
      maximumY,
      Math.max(0, y),
    ),
  };
};

export default function TextField({
  field,
  selected,
  onUpdate,
  onDelete,
  onSelect,
}: TextFieldProps) {
  const textareaRef =
    useRef<HTMLTextAreaElement | null>(
      null,
    );

  const measureRef =
    useRef<HTMLDivElement | null>(
      null,
    );

  const fieldRef =
    useRef<HTMLDivElement | null>(
      null,
    );

  /*
   * ==========================================================
   * DRAG STATE
   * ==========================================================
   */

  const dragging =
    useRef(false);

  const dragPointerId =
    useRef<number | null>(null);

  const dragStart =
    useRef<Point>({
      x: 0,
      y: 0,
    });

  const fieldStart =
    useRef<Point>({
      x: 0,
      y: 0,
    });

  /*
   * ==========================================================
   * RESIZE STATE
   * ==========================================================
   */

  const resizing =
    useRef(false);

  const resizePointerId =
    useRef<number | null>(null);

  const resizeDirection =
    useRef<ResizeDirection | null>(
      null,
    );

  const resizeStart =
    useRef<ResizeStart>({
      clientX: 0,
      clientY: 0,
      width: 0,
      height: 0,
    });

  /*
   * ==========================================================
   * MANUAL RESIZE FLAGS
   * ==========================================================
   *
   * Once the user manually changes a dimension, automatic
   * measurement must not immediately override it.
   */

  const manuallyResizedWidth =
    useRef(false);

  const manuallyResizedHeight =
    useRef(false);

  /*
   * ==========================================================
   * START EDITING
   * ==========================================================
   */

  const startEditing =
    useCallback(() => {
      onSelect(field.id);

      requestAnimationFrame(() => {
        const textareaElement =
          textareaRef.current;

        if (!textareaElement) {
          return;
        }

        textareaElement.focus();

        const textLength =
          textareaElement.value.length;

        textareaElement.setSelectionRange(
          textLength,
          textLength,
        );
      });
    }, [
      field.id,
      onSelect,
    ]);

  /*
   * ==========================================================
   * AUTOMATIC HEIGHT
   * ==========================================================
   */

  useLayoutEffect(() => {
    if (
      resizing.current ||
      manuallyResizedHeight.current
    ) {
      return;
    }

    const measureElement =
      measureRef.current;

    if (!measureElement) {
      return;
    }

    const text =
      field.value ||
      "Type here...";

    measureElement.style.width =
      `${Math.max(
        MIN_WIDTH,
        field.width,
      )}px`;

    measureElement.style.whiteSpace =
      "pre-wrap";

    measureElement.textContent =
      text;

    const measuredHeight =
      Math.ceil(
        measureElement.getBoundingClientRect()
          .height,
      );

    const desiredHeight =
      Math.min(
        MAX_HEIGHT,
        Math.max(
          MIN_HEIGHT,
          measuredHeight + 12,
        ),
      );

    const nextHeight =
      Math.max(
        field.height,
        desiredHeight,
      );

    if (
      Math.abs(
        field.height -
          nextHeight,
      ) > 1
    ) {
      onUpdate(
        field.id,
        {
          height:
            nextHeight,
        },
      );
    }
  }, [
    field.id,
    field.value,
    field.width,
    field.height,
    onUpdate,
  ]);

  /*
   * ==========================================================
   * AUTOMATIC WIDTH
   * ==========================================================
   */

  useEffect(() => {
    if (
      resizing.current ||
      manuallyResizedWidth.current
    ) {
      return;
    }

    const measureElement =
      measureRef.current;

    if (!measureElement) {
      return;
    }

    const text =
      field.value ||
      "Type here...";

    /*
     * Do not automatically stretch width when the user is
     * intentionally entering multiline content.
     */
    if (
      text.includes("\n")
    ) {
      return;
    }

    measureElement.style.width =
      "auto";

    measureElement.style.whiteSpace =
      "pre";

    measureElement.textContent =
      text;

    const measuredWidth =
      Math.ceil(
        measureElement.getBoundingClientRect()
          .width,
      );

    const desiredWidth =
      Math.min(
        MAX_WIDTH,
        Math.max(
          MIN_WIDTH,
          measuredWidth + 24,
        ),
      );

    if (
      Math.abs(
        field.width -
          desiredWidth,
      ) > 1
    ) {
      onUpdate(
        field.id,
        {
          width:
            desiredWidth,
        },
      );
    }

    measureElement.style.whiteSpace =
      "pre-wrap";
  }, [
    field.id,
    field.value,
    field.width,
    onUpdate,
  ]);

  /*
   * ==========================================================
   * KEYBOARD CONTROLS
   * ==========================================================
   */

  useEffect(() => {
    const handleKeyDown = (
      event: KeyboardEvent,
    ) => {
      if (!selected) {
        return;
      }

      /*
       * Let the textarea handle normal typing.
       */
      if (
        document.activeElement ===
        textareaRef.current
      ) {
        return;
      }

      /*
       * Delete selected field.
       */
      if (
        event.key === "Delete" ||
        event.key === "Backspace"
      ) {
        event.preventDefault();

        onDelete(field.id);

        return;
      }

      /*
       * Enter starts editing.
       */
      if (
        event.key === "Enter"
      ) {
        event.preventDefault();

        startEditing();

        return;
      }

      const step =
        event.shiftKey
          ? KEYBOARD_FAST_STEP
          : KEYBOARD_STEP;

      const fieldElement =
        fieldRef.current;

      if (!fieldElement) {
        return;
      }

      const documentLayerElement =
        getInteractionContainer(
          fieldElement,
        );

      if (!documentLayerElement) {
        return;
      }

      const maximumX =
        Math.max(
          0,
          documentLayerElement.offsetWidth -
            field.width,
        );

      const maximumY =
        Math.max(
          0,
          documentLayerElement.offsetHeight -
            field.height,
        );

      switch (event.key) {
        case "ArrowLeft":
          event.preventDefault();

          onUpdate(
            field.id,
            {
              x: Math.max(
                0,
                field.x -
                  step,
              ),
            },
          );

          break;

        case "ArrowRight":
          event.preventDefault();

          onUpdate(
            field.id,
            {
              x: Math.min(
                maximumX,
                field.x +
                  step,
              ),
            },
          );

          break;

        case "ArrowUp":
          event.preventDefault();

          onUpdate(
            field.id,
            {
              y: Math.max(
                0,
                field.y -
                  step,
              ),
            },
          );

          break;

        case "ArrowDown":
          event.preventDefault();

          onUpdate(
            field.id,
            {
              y: Math.min(
                maximumY,
                field.y +
                  step,
              ),
            },
          );

          break;

        default:
          break;
      }
    };

    window.addEventListener(
      "keydown",
      handleKeyDown,
    );

    return () => {
      window.removeEventListener(
        "keydown",
        handleKeyDown,
      );
    };
  }, [
    selected,
    field.id,
    field.x,
    field.y,
    field.width,
    field.height,
    onDelete,
    onUpdate,
    startEditing,
  ]);

  /*
   * ==========================================================
   * START DRAG
   * ==========================================================
   */

  const beginDrag = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();

    onSelect(field.id);

    const fieldElement =
      fieldRef.current;

    if (!fieldElement) {
      return;
    }

    dragging.current =
      true;

    dragPointerId.current =
      event.pointerId;

    dragStart.current = {
      x: event.clientX,
      y: event.clientY,
    };

    fieldStart.current = {
      x: field.x,
      y: field.y,
    };

    try {
      event.currentTarget.setPointerCapture(
        event.pointerId,
      );
    } catch {
      /*
       * Pointer capture is not supported in every environment.
       */
    }
  };

  /*
   * ==========================================================
   * DRAG MOVE
   * ==========================================================
   */

  const handleDragPointerMove = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (!dragging.current) {
      return;
    }

    if (
      dragPointerId.current !==
      event.pointerId
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const documentLayerElement =
      getInteractionContainer(
        event.currentTarget,
      );

    if (!documentLayerElement) {
      return;
    }

    const {
      scaleX,
      scaleY,
    } =
      getDocumentScale(
        documentLayerElement,
      );

    const documentDeltaX =
      (
        event.clientX -
        dragStart.current.x
      ) / scaleX;

    const documentDeltaY =
      (
        event.clientY -
        dragStart.current.y
      ) / scaleY;

    const nextPosition =
      clampFieldPosition(
        fieldStart.current.x +
          documentDeltaX,

        fieldStart.current.y +
          documentDeltaY,

        field.width,
        field.height,

        documentLayerElement,
      );

    onUpdate(
      field.id,
      {
        x:
          nextPosition.x,

        y:
          nextPosition.y,
      },
    );
  };

  /*
   * ==========================================================
   * END DRAG
   * ==========================================================
   */

  const handleDragPointerUp = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (
      dragPointerId.current ===
      event.pointerId
    ) {
      dragging.current =
        false;

      dragPointerId.current =
        null;
    }

    if (
      event.currentTarget.hasPointerCapture(
        event.pointerId,
      )
    ) {
      event.currentTarget.releasePointerCapture(
        event.pointerId,
      );
    }
  };

  /*
   * ==========================================================
   * START RESIZE
   * ==========================================================
   */

  const handleResizePointerDown = (
    event: ReactPointerEvent<HTMLDivElement>,
    direction: ResizeDirection,
  ) => {
    event.preventDefault();
    event.stopPropagation();

    onSelect(field.id);

    if (
      direction === "right" ||
      direction === "corner"
    ) {
      manuallyResizedWidth.current =
        true;
    }

    if (
      direction === "bottom" ||
      direction === "corner"
    ) {
      manuallyResizedHeight.current =
        true;
    }

    resizing.current =
      true;

    resizePointerId.current =
      event.pointerId;

    resizeDirection.current =
      direction;

    resizeStart.current = {
      clientX:
        event.clientX,

      clientY:
        event.clientY,

      width:
        Math.min(
          MAX_WIDTH,
          Math.max(
            MIN_WIDTH,
            field.width,
          ),
        ),

      height:
        Math.min(
          MAX_HEIGHT,
          Math.max(
            MIN_HEIGHT,
            field.height,
          ),
        ),
    };

    try {
      event.currentTarget.setPointerCapture(
        event.pointerId,
      );
    } catch {
      /*
       * Pointer capture is optional.
       */
    }
  };

  /*
   * ==========================================================
   * RESIZE MOVE
   * ==========================================================
   */

  const handleResizePointerMove = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (!resizing.current) {
      return;
    }

    if (
      resizePointerId.current !==
      event.pointerId
    ) {
      return;
    }

    const direction =
      resizeDirection.current;

    if (!direction) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    /*
     * CRITICAL:
     *
     * The resize handle itself is NOT the coordinate
     * container.
     *
     * We resolve the actual document layer.
     */
    const documentLayerElement =
      getInteractionContainer(
        event.currentTarget,
      );

    if (!documentLayerElement) {
      return;
    }

    const {
      scaleX,
      scaleY,
    } =
      getDocumentScale(
        documentLayerElement,
      );

    /*
     * Convert physical screen movement into internal document
     * coordinates.
     */
    const documentDeltaX =
      (
        event.clientX -
        resizeStart.current.clientX
      ) / scaleX;

    const documentDeltaY =
      (
        event.clientY -
        resizeStart.current.clientY
      ) / scaleY;

    /*
     * Available space from the field's current position to
     * the document boundaries.
     */
    const availableWidth =
      Math.max(
        MIN_WIDTH,
        documentLayerElement.offsetWidth -
          field.x,
      );

    const availableHeight =
      Math.max(
        MIN_HEIGHT,
        documentLayerElement.offsetHeight -
          field.y,
      );

    const maximumWidth =
      Math.min(
        MAX_WIDTH,
        availableWidth,
      );

    const maximumHeight =
      Math.min(
        MAX_HEIGHT,
        availableHeight,
      );

    /*
     * RIGHT EDGE
     */
    if (
      direction === "right"
    ) {
      const nextWidth =
        Math.min(
          maximumWidth,
          Math.max(
            MIN_WIDTH,
            resizeStart.current.width +
              documentDeltaX,
          ),
        );

      onUpdate(
        field.id,
        {
          width:
            nextWidth,
        },
      );

      return;
    }

    /*
     * BOTTOM EDGE
     */
    if (
      direction === "bottom"
    ) {
      const nextHeight =
        Math.min(
          maximumHeight,
          Math.max(
            MIN_HEIGHT,
            resizeStart.current.height +
              documentDeltaY,
          ),
        );

      onUpdate(
        field.id,
        {
          height:
            nextHeight,
        },
      );

      return;
    }

    /*
     * BOTTOM RIGHT CORNER
     *
     * Text fields intentionally resize width and height
     * independently.
     */
    const nextWidth =
      Math.min(
        maximumWidth,
        Math.max(
          MIN_WIDTH,
          resizeStart.current.width +
            documentDeltaX,
        ),
      );

    const nextHeight =
      Math.min(
        maximumHeight,
        Math.max(
          MIN_HEIGHT,
          resizeStart.current.height +
            documentDeltaY,
        ),
      );

    onUpdate(
      field.id,
      {
        width:
          nextWidth,

        height:
          nextHeight,
      },
    );
  };

  /*
   * ==========================================================
   * END RESIZE
   * ==========================================================
   */

  const handleResizePointerUp = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (
      resizePointerId.current ===
      event.pointerId
    ) {
      resizing.current =
        false;

      resizePointerId.current =
        null;

      resizeDirection.current =
        null;
    }

    if (
      event.currentTarget.hasPointerCapture(
        event.pointerId,
      )
    ) {
      event.currentTarget.releasePointerCapture(
        event.pointerId,
      );
    }
  };

  /*
   * ==========================================================
   * POINTER CANCEL
   * ==========================================================
   */

  const handlePointerCancel = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (
      dragPointerId.current ===
      event.pointerId
    ) {
      dragging.current =
        false;

      dragPointerId.current =
        null;
    }

    if (
      resizePointerId.current ===
      event.pointerId
    ) {
      resizing.current =
        false;

      resizePointerId.current =
        null;

      resizeDirection.current =
        null;
    }

    if (
      event.currentTarget.hasPointerCapture(
        event.pointerId,
      )
    ) {
      event.currentTarget.releasePointerCapture(
        event.pointerId,
      );
    }
  };

  /*
   * ==========================================================
   * TEXT CHANGE
   * ==========================================================
   */

  const handleChange = (
    event: ChangeEvent<HTMLTextAreaElement>,
  ) => {
    onUpdate(
      field.id,
      {
        value:
          event.target.value,
      },
    );
  };

  /*
   * ==========================================================
   * TEXTAREA KEYBOARD
   * ==========================================================
   */

  const handleTextareaKeyDown = (
    event: ReactKeyboardEvent<HTMLTextAreaElement>,
  ) => {
    if (
      event.key === "Escape"
    ) {
      event.preventDefault();

      textareaRef.current?.blur();

      onSelect(field.id);
    }
  };

  /*
   * ==========================================================
   * FIELD POINTER DOWN
   * ==========================================================
   */

  const handleFieldPointerDown = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    const targetElement =
      event.target as HTMLElement;

    /*
     * Resize handles control themselves.
     */
    if (
      targetElement.closest(
        ".field-resize-handle",
      )
    ) {
      return;
    }

    /*
     * Move handle controls itself.
     */
    if (
      targetElement.closest(
        ".field-drag-handle",
      )
    ) {
      return;
    }

    /*
     * Textarea remains an editing surface.
     */
    if (
      textareaRef.current?.contains(
        targetElement,
      )
    ) {
      event.stopPropagation();

      onSelect(field.id);

      return;
    }

    event.stopPropagation();

    onSelect(field.id);
  };

  /*
   * ==========================================================
   * RENDER
   * ==========================================================
   */

  return (
    <>
      <div
        ref={measureRef}
        className="text-measure"
        aria-hidden="true"
      />

      <div
        ref={fieldRef}
        className={`document-field ${
          selected
            ? "document-field-selected"
            : ""
        }`}
        style={{
          position:
            "absolute",

          left:
            `${field.x}px`,

          top:
            `${field.y}px`,

          width:
            `${Math.max(
              MIN_WIDTH,
              Math.min(
                MAX_WIDTH,
                field.width,
              ),
            )}px`,

          height:
            `${Math.max(
              MIN_HEIGHT,
              Math.min(
                MAX_HEIGHT,
                field.height,
              ),
            )}px`,

          minWidth:
            `${MIN_WIDTH}px`,

          minHeight:
            `${MIN_HEIGHT}px`,

          boxSizing:
            "border-box",

          overflow:
            "visible",

          touchAction:
            "auto",
        }}
        onPointerDown={
          handleFieldPointerDown
        }
        onClick={(event) => {
          event.stopPropagation();
        }}
        onDoubleClick={(event) => {
          event.stopPropagation();

          startEditing();
        }}
      >
        <textarea
          ref={textareaRef}
          value={field.value}
          placeholder="Type here..."
          autoFocus={false}
          spellCheck
          rows={1}
          aria-label="Text field"
          onChange={
            handleChange
          }
          onKeyDown={
            handleTextareaKeyDown
          }
          onFocus={() => {
            onSelect(field.id);
          }}
          onPointerDown={(event) => {
            event.stopPropagation();

            onSelect(field.id);
          }}
          onPointerMove={(event) => {
            event.stopPropagation();
          }}
          onPointerUp={(event) => {
            event.stopPropagation();
          }}
          onClick={(event) => {
            event.stopPropagation();
          }}
          onDoubleClick={(event) => {
            event.stopPropagation();
          }}
          style={{
            position:
              "relative",

            zIndex:
              1,

            display:
              "block",

            width:
              "100%",

            height:
              "100%",

            minWidth:
              "0",

            minHeight:
              "0",

            boxSizing:
              "border-box",

            resize:
              "none",

            touchAction:
              "auto",
          }}
        />

        {selected && (
          <>
            {/* ================================================
                MOVE HANDLE
                ================================================ */}

            <div
              className="field-drag-handle"
              role="button"
              tabIndex={0}
              aria-label="Move text field"
              title="Drag to move"
              style={{
                position:
                  "absolute",

                zIndex:
                  5000,

                pointerEvents:
                  "auto",

                touchAction:
                  "none",

                userSelect:
                  "none",

                WebkitUserSelect:
                  "none",

                cursor:
                  "grab",
              }}
              onPointerDown={
                beginDrag
              }
              onPointerMove={
                handleDragPointerMove
              }
              onPointerUp={
                handleDragPointerUp
              }
              onPointerCancel={
                handlePointerCancel
              }
            >
              ⋮⋮
            </div>

            {/* ================================================
                RIGHT RESIZE
                ================================================ */}

            <div
              className="field-resize-handle field-resize-right"
              role="presentation"
              aria-hidden="true"
              style={{
                position:
                  "absolute",

                top:
                  "4px",

                right:
                  "-7px",

                bottom:
                  "4px",

                width:
                  "14px",

                zIndex:
                  5001,

                display:
                  "block",

                pointerEvents:
                  "auto",

                background:
                  "transparent",

                touchAction:
                  "none",

                userSelect:
                  "none",

                cursor:
                  "ew-resize",
              }}
              onPointerDown={(
                event,
              ) => {
                handleResizePointerDown(
                  event,
                  "right",
                );
              }}
              onPointerMove={
                handleResizePointerMove
              }
              onPointerUp={
                handleResizePointerUp
              }
              onPointerCancel={
                handleResizePointerUp
              }
            />

            {/* ================================================
                BOTTOM RESIZE
                ================================================ */}

            <div
              className="field-resize-handle field-resize-bottom"
              role="presentation"
              aria-hidden="true"
              style={{
                position:
                  "absolute",

                left:
                  "4px",

                right:
                  "4px",

                bottom:
                  "-7px",

                height:
                  "14px",

                zIndex:
                  5001,

                display:
                  "block",

                pointerEvents:
                  "auto",

                background:
                  "transparent",

                touchAction:
                  "none",

                userSelect:
                  "none",

                cursor:
                  "ns-resize",
              }}
              onPointerDown={(
                event,
              ) => {
                handleResizePointerDown(
                  event,
                  "bottom",
                );
              }}
              onPointerMove={
                handleResizePointerMove
              }
              onPointerUp={
                handleResizePointerUp
              }
              onPointerCancel={
                handleResizePointerUp
              }
            />

            {/* ================================================
                CORNER RESIZE
                ================================================ */}

            <div
              className="field-resize-handle field-resize-corner"
              role="presentation"
              aria-hidden="true"
              style={{
                position:
                  "absolute",

                right:
                  "-9px",

                bottom:
                  "-9px",

                width:
                  "20px",

                height:
                  "20px",

                zIndex:
                  5002,

                display:
                  "block",

                pointerEvents:
                  "auto",

                background:
                  "transparent",

                touchAction:
                  "none",

                userSelect:
                  "none",

                cursor:
                  "nwse-resize",
              }}
              onPointerDown={(
                event,
              ) => {
                handleResizePointerDown(
                  event,
                  "corner",
                );
              }}
              onPointerMove={
                handleResizePointerMove
              }
              onPointerUp={
                handleResizePointerUp
              }
              onPointerCancel={
                handleResizePointerUp
              }
            >
              <span
                aria-hidden="true"
                style={{
                  position:
                    "absolute",

                  right:
                    "2px",

                  bottom:
                    "2px",

                  width:
                    "9px",

                  height:
                    "9px",

                  borderRight:
                    "2px solid #181818",

                  borderBottom:
                    "2px solid #181818",

                  pointerEvents:
                    "none",
                }}
              />
            </div>

            {/* ================================================
                DELETE BUTTON
                ================================================ */}

            <button
              type="button"
              className="field-delete"
              aria-label="Delete text field"
              title="Delete text field"
              style={{
                zIndex:
                  5003,

                pointerEvents:
                  "auto",
              }}
              onPointerDown={(
                event,
              ) => {
                event.preventDefault();
                event.stopPropagation();

                onDelete(
                  field.id,
                );
              }}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
            >
              ×
            </button>
          </>
        )}
      </div>
    </>
  );
}
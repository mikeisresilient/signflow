import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import type { DocumentField } from "../../types/document";

interface TextFieldProps {
  field: DocumentField;
  selected: boolean;
  onUpdate: (
    id: string,
    updates: Partial<DocumentField>
  ) => void;
  onDelete: (id: string) => void;
  onSelect: (id: string) => void;
}

type ResizeDirection =
  | "right"
  | "bottom"
  | "corner";

export default function TextField({
  field,
  selected,
  onUpdate,
  onDelete,
  onSelect,
}: TextFieldProps) {
  const textareaRef =
    useRef<HTMLTextAreaElement>(null);

  const measureRef =
    useRef<HTMLDivElement>(null);

  const dragging =
    useRef(false);

  const resizing =
    useRef(false);

  const resizeDirection =
    useRef<ResizeDirection | null>(null);

  /*
   * Once the user manually changes a dimension,
   * automatic sizing should no longer overwrite it.
   */
  const manuallyResizedWidth =
    useRef(false);

  const manuallyResizedHeight =
    useRef(false);

  const dragStart =
    useRef({
      x: 0,
      y: 0,
    });

  const fieldStart =
    useRef({
      x: 0,
      y: 0,
    });

  const resizeStart =
    useRef({
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    });

  const [editing, setEditing] =
    useState(true);

  const MIN_WIDTH = 180;
  const MAX_WIDTH = 700;

  const MIN_HEIGHT = 36;
  const MAX_HEIGHT = 600;

  /*
   * Start editing the field.
   */
  const startEditing = useCallback(() => {
    setEditing(true);

    onSelect(field.id);

    setTimeout(() => {
      const textarea =
        textareaRef.current;

      if (!textarea) {
        return;
      }

      textarea.focus();

      const length =
        textarea.value.length;

      textarea.setSelectionRange(
        length,
        length
      );
    }, 0);
  }, [field.id, onSelect]);

  /*
   * Automatically grow the height when
   * content requires more space.
   *
   * IMPORTANT:
   * We never shrink a manually resized
   * field back to its measured height.
   */
  useLayoutEffect(() => {
    if (resizing.current) {
      return;
    }

    if (manuallyResizedHeight.current) {
      return;
    }

    const measure =
      measureRef.current;

    if (!measure) {
      return;
    }

    const text =
      field.value || "Type here...";

    measure.style.width =
      `${field.width}px`;

    measure.style.whiteSpace =
      "pre-wrap";

    measure.textContent = text;

    const measuredHeight =
      Math.ceil(
        measure.getBoundingClientRect()
          .height
      );

    const desiredHeight =
      Math.min(
        MAX_HEIGHT,
        Math.max(
          MIN_HEIGHT,
          measuredHeight + 10
        )
      );

    /*
     * Only grow automatically.
     * Never reduce the existing height.
     */
    const newHeight =
      Math.max(
        field.height,
        desiredHeight
      );

    if (
      Math.abs(
        field.height - newHeight
      ) > 1
    ) {
      onUpdate(field.id, {
        height: newHeight,
      });
    }
  }, [
    field.id,
    field.value,
    field.width,
    field.height,
    onUpdate,
  ]);

  /*
   * Automatically determine the initial width
   * based on the text.
   *
   * Once manually resized, width stays under
   * the user's control.
   */
  useEffect(() => {
    if (resizing.current) {
      return;
    }

    if (manuallyResizedWidth.current) {
      return;
    }

    const measure =
      measureRef.current;

    if (!measure) {
      return;
    }

    const text =
      field.value || "Type here...";

    /*
     * Only automatically size single-line
     * content.
     *
     * Multiline text should use the existing
     * field width and wrap naturally.
     */
    if (text.includes("\n")) {
      return;
    }

    measure.style.width =
      "auto";

    measure.style.whiteSpace =
      "pre";

    measure.textContent =
      text;

    const measuredWidth =
      Math.ceil(
        measure.getBoundingClientRect()
          .width
      );

    const desiredWidth =
      Math.min(
        MAX_WIDTH,
        Math.max(
          MIN_WIDTH,
          measuredWidth + 24
        )
      );

    if (
      Math.abs(
        field.width - desiredWidth
      ) > 1
    ) {
      onUpdate(field.id, {
        width: desiredWidth,
      });
    }

    measure.style.whiteSpace =
      "pre-wrap";
  }, [
    field.id,
    field.value,
    field.width,
    onUpdate,
  ]);

  /*
   * Keyboard controls.
   */
  useEffect(() => {
    const handleKeyDown = (
      event: KeyboardEvent
    ) => {
      if (!selected) {
        return;
      }

      /*
       * Don't interfere while the user is
       * actively typing.
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
      if (event.key === "Enter") {
        event.preventDefault();

        startEditing();

        return;
      }

      const step =
        event.shiftKey ? 10 : 1;

      switch (event.key) {
        case "ArrowLeft":
          event.preventDefault();

          onUpdate(field.id, {
            x: Math.max(
              0,
              field.x - step
            ),
          });

          break;

        case "ArrowRight":
          event.preventDefault();

          onUpdate(field.id, {
            x:
              field.x + step,
          });

          break;

        case "ArrowUp":
          event.preventDefault();

          onUpdate(field.id, {
            y: Math.max(
              0,
              field.y - step
            ),
          });

          break;

        case "ArrowDown":
          event.preventDefault();

          onUpdate(field.id, {
            y:
              field.y + step,
          });

          break;

        default:
          break;
      }
    };

    window.addEventListener(
      "keydown",
      handleKeyDown
    );

    return () => {
      window.removeEventListener(
        "keydown",
        handleKeyDown
      );
    };
  }, [
    selected,
    field.id,
    field.x,
    field.y,
    onDelete,
    onUpdate,
    startEditing,
  ]);

  /*
   * Start dragging the field.
   */
  const handlePointerDown = (
    event: React.PointerEvent<HTMLDivElement>
  ) => {
    /*
     * Resize handles have their own
     * pointer behavior.
     */
    if (
      (
        event.target as HTMLElement
      ).closest(
        ".field-resize-handle"
      )
    ) {
      return;
    }

    /*
     * Don't start dragging when directly
     * interacting with the textarea.
     */
    if (
      event.target ===
        textareaRef.current ||
      textareaRef.current?.contains(
        event.target as Node
      )
    ) {
      return;
    }

    event.stopPropagation();

    onSelect(field.id);

    dragging.current = true;

    dragStart.current = {
      x: event.clientX,
      y: event.clientY,
    };

    fieldStart.current = {
      x: field.x,
      y: field.y,
    };

    event.currentTarget.setPointerCapture(
      event.pointerId
    );
  };

  /*
   * Move field while dragging.
   */
  const handlePointerMove = (
    event: React.PointerEvent<HTMLDivElement>
  ) => {
    if (!dragging.current) {
      return;
    }

    const deltaX =
      event.clientX -
      dragStart.current.x;

    const deltaY =
      event.clientY -
      dragStart.current.y;

    const parent =
      event.currentTarget
        .offsetParent as HTMLElement | null;

    if (!parent) {
      return;
    }

    const parentRect =
      parent.getBoundingClientRect();

    const scaleX =
      parent.offsetWidth > 0
        ? parentRect.width /
          parent.offsetWidth
        : 1;

    const scaleY =
      parent.offsetHeight > 0
        ? parentRect.height /
          parent.offsetHeight
        : 1;

    const coordinateDeltaX =
      deltaX /
      Math.max(scaleX, 0.0001);

    const coordinateDeltaY =
      deltaY /
      Math.max(scaleY, 0.0001);

    const maxX = Math.max(
      0,
      parent.offsetWidth -
        field.width
    );

    const maxY = Math.max(
      0,
      parent.offsetHeight -
        field.height
    );

    onUpdate(field.id, {
      x: Math.min(
        maxX,
        Math.max(
          0,
          fieldStart.current.x +
            coordinateDeltaX
        )
      ),

      y: Math.min(
        maxY,
        Math.max(
          0,
          fieldStart.current.y +
            coordinateDeltaY
        )
      ),
    });
  };

  /*
   * Finish dragging.
   */
  const handlePointerUp = (
    event: React.PointerEvent<HTMLDivElement>
  ) => {
    dragging.current = false;

    if (
      event.currentTarget.hasPointerCapture(
        event.pointerId
      )
    ) {
      event.currentTarget.releasePointerCapture(
        event.pointerId
      );
    }
  };

  /*
   * Start resizing.
   */
  const handleResizePointerDown = (
    event: React.PointerEvent<HTMLDivElement>,
    direction: ResizeDirection
  ) => {
    event.preventDefault();
    event.stopPropagation();

    onSelect(field.id);

    resizing.current = true;

    resizeDirection.current =
      direction;

    /*
     * Record which dimensions the user
     * intentionally changed.
     */
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

    resizeStart.current = {
      x: event.clientX,
      y: event.clientY,
      width: field.width,
      height: field.height,
    };

    event.currentTarget.setPointerCapture(
      event.pointerId
    );
  };

  /*
   * Resize field.
   */
  const handleResizePointerMove = (
    event: React.PointerEvent<HTMLDivElement>
  ) => {
    if (!resizing.current) {
      return;
    }

    const direction =
      resizeDirection.current;

    if (!direction) {
      return;
    }

    const deltaX =
      event.clientX -
      resizeStart.current.x;

    const deltaY =
      event.clientY -
      resizeStart.current.y;

    let newWidth =
      resizeStart.current.width;

    let newHeight =
      resizeStart.current.height;

    if (
      direction === "right" ||
      direction === "corner"
    ) {
      newWidth =
        Math.min(
          MAX_WIDTH,
          Math.max(
            MIN_WIDTH,
            resizeStart.current.width +
              deltaX
          )
        );
    }

    if (
      direction === "bottom" ||
      direction === "corner"
    ) {
      newHeight =
        Math.min(
          MAX_HEIGHT,
          Math.max(
            MIN_HEIGHT,
            resizeStart.current.height +
              deltaY
          )
        );
    }

    onUpdate(field.id, {
      width: newWidth,
      height: newHeight,
    });
  };

  /*
   * Finish resizing.
   */
  const handleResizePointerUp = (
    event: React.PointerEvent<HTMLDivElement>
  ) => {
    resizing.current = false;

    resizeDirection.current =
      null;

    if (
      event.currentTarget.hasPointerCapture(
        event.pointerId
      )
    ) {
      event.currentTarget.releasePointerCapture(
        event.pointerId
      );
    }
  };

  /*
   * Update text.
   */
  const handleChange = (
    event: React.ChangeEvent<HTMLTextAreaElement>
  ) => {
    onUpdate(field.id, {
      value: event.target.value,
    });
  };

  /*
   * Textarea keyboard behavior.
   */
  const handleTextareaKeyDown = (
    event: React.KeyboardEvent<HTMLTextAreaElement>
  ) => {
    /*
     * Escape exits editing.
     */
    if (event.key === "Escape") {
      event.preventDefault();

      setEditing(false);

      textareaRef.current?.blur();

      return;
    }

    /*
     * Enter is intentionally allowed.
     *
     * This lets users create multiline
     * text inside the field.
     */
  };

  return (
    <>
      {/* Hidden measurement element */}
      <div
        ref={measureRef}
        className="text-measure"
        aria-hidden="true"
      />

      {/* Document field */}
      <div
        className={`document-field ${
          selected
            ? "document-field-selected"
            : ""
        }`}
        style={{
          left: `${field.x}px`,
          top: `${field.y}px`,
          width: `${field.width}px`,
          minHeight: `${field.height}px`,
          height: `${field.height}px`,
        }}
        onPointerDown={
          handlePointerDown
        }
        onPointerMove={
          handlePointerMove
        }
        onPointerUp={
          handlePointerUp
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
          autoFocus={editing}
          spellCheck
          rows={1}
          onChange={handleChange}
          onKeyDown={
            handleTextareaKeyDown
          }
          onFocus={() => {
            setEditing(true);

            onSelect(field.id);
          }}
          onBlur={() => {
            setEditing(false);
          }}
          onPointerDown={(event) => {
            event.stopPropagation();
          }}
          onClick={(event) => {
            event.stopPropagation();
          }}
          onDoubleClick={(event) => {
            event.stopPropagation();
          }}
        />

        {selected && (
          <>
            <div
              className="field-drag-handle"
              role="button"
              aria-label="Move text field"
              title="Drag to move"
              onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();

                onSelect(field.id);

                dragging.current = true;

                dragStart.current = {
                  x: event.clientX,
                  y: event.clientY,
                };

                fieldStart.current = {
                  x: field.x,
                  y: field.y,
                };

                event.currentTarget.setPointerCapture(
                  event.pointerId
                );
              }}
              onPointerMove={
                handlePointerMove
              }
              onPointerUp={
                handlePointerUp
              }
              onPointerCancel={
                handlePointerUp
              }
            >
              ⋮⋮
            </div>

            {/* Right resize handle */}
            <div
              className="field-resize-handle field-resize-right"
              role="presentation"
              onPointerDown={(event) =>
                handleResizePointerDown(
                  event,
                  "right"
                )
              }
              onPointerMove={
                handleResizePointerMove
              }
              onPointerUp={
                handleResizePointerUp
              }
            />

            {/* Bottom resize handle */}
            <div
              className="field-resize-handle field-resize-bottom"
              role="presentation"
              onPointerDown={(event) =>
                handleResizePointerDown(
                  event,
                  "bottom"
                )
              }
              onPointerMove={
                handleResizePointerMove
              }
              onPointerUp={
                handleResizePointerUp
              }
            />

            {/* Corner resize handle */}
            <div
              className="field-resize-handle field-resize-corner"
              role="presentation"
              onPointerDown={(event) =>
                handleResizePointerDown(
                  event,
                  "corner"
                )
              }
              onPointerMove={
                handleResizePointerMove
              }
              onPointerUp={
                handleResizePointerUp
              }
            />

            {/* Delete button */}
            <button
              type="button"
              className="field-delete"
              aria-label="Delete text field"
              onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();

                onDelete(field.id);
              }}
              onClick={(event) => {
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

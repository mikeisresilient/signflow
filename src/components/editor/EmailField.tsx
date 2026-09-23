import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, PointerEvent } from "react";

import type { DocumentField } from "../../types/document";

interface EmailFieldProps {
  field: DocumentField;
  selected: boolean;
  onUpdate: (
    id: string,
    updates: Partial<DocumentField>
  ) => void;
  onDelete: (id: string) => void;
  onSelect: (id: string) => void;
}

interface InteractionState {
  type: "drag" | "resize";
  pointerId: number;

  startX: number;
  startY: number;

  initialX: number;
  initialY: number;

  initialWidth: number;
  initialHeight: number;

  direction?: "right" | "bottom" | "corner";
}

const MIN_WIDTH = 120;
const MIN_HEIGHT = 32;
const MAX_WIDTH = 700;
const MAX_HEIGHT = 300;

const PRECISION_STEP = 2;
const PRECISION_FAST_STEP = 10;
const PRECISION_CONTROLLER_HEIGHT = 86;
const PRECISION_CONTROLLER_MARGIN = 12;

/*
 * --------------------------------------------------
 * FIND THE ACTUAL DOCUMENT COORDINATE CONTAINER
 * --------------------------------------------------
 *
 * Resize handles are children of the field itself.
 * Therefore their offsetParent is normally the field,
 * NOT the document field layer.
 *
 * We always resolve the parent layer explicitly.
 */
const getInteractionContainer = (
  element: HTMLElement
): HTMLElement | null => {
  const fieldElement =
    element.closest(".email-field");

  if (fieldElement instanceof HTMLElement) {
    const parent =
      fieldElement.parentElement;

    if (parent instanceof HTMLElement) {
      return parent;
    }
  }

  let currentElement: HTMLElement | null =
    element.parentElement;

  while (currentElement) {
    const classNameValue =
      typeof currentElement.className === "string"
        ? currentElement.className
        : "";

    if (
      classNameValue.includes("field-layer") ||
      classNameValue.includes("docx-field-layer") ||
      classNameValue.includes("image-field-layer")
    ) {
      return currentElement;
    }

    currentElement =
      currentElement.parentElement;
  }

  const offsetParent =
    element.offsetParent;

  return offsetParent instanceof HTMLElement
    ? offsetParent
    : null;
};

export default function EmailField({
  field,
  selected,
  onUpdate,
  onDelete,
  onSelect,
}: EmailFieldProps) {
  const interactionRef =
    useRef<InteractionState | null>(null);

  const [isEditing, setIsEditing] =
    useState(false);

  const [isCoarsePointer, setIsCoarsePointer] =
    useState(false);

  const [precisionAbove, setPrecisionAbove] =
    useState(false);

  const fieldRef =
    useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const mediaQuery = window.matchMedia(
      "(pointer: coarse)"
    );

    const updatePointerMode = () => {
      setIsCoarsePointer(mediaQuery.matches);
    };

    updatePointerMode();

    mediaQuery.addEventListener(
      "change",
      updatePointerMode
    );

    return () => {
      mediaQuery.removeEventListener(
        "change",
        updatePointerMode
      );
    };
  }, []);

  useEffect(() => {
    if (!selected || !isCoarsePointer) {
      return;
    }

    const frame =
      window.requestAnimationFrame(() => {
        const element =
          fieldRef.current;

        if (!element) {
          return;
        }

        const container =
          getInteractionContainer(element);

        if (!container) {
          return;
        }

        const controllerSpace =
          PRECISION_CONTROLLER_HEIGHT +
          PRECISION_CONTROLLER_MARGIN;

        const shouldPlaceAbove =
          field.y +
            field.height +
            controllerSpace >
          container.offsetHeight;

        setPrecisionAbove(shouldPlaceAbove);
      });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [
    selected,
    isCoarsePointer,
    field.x,
    field.y,
    field.width,
    field.height,
  ]);

  const moveFieldPrecisely = (
    deltaX: number,
    deltaY: number
  ) => {
    const element =
      fieldRef.current;

    if (!element) {
      return;
    }

    const container =
      getInteractionContainer(element);

    if (!container) {
      return;
    }

    const fieldWidth =
      Math.max(
        MIN_WIDTH,
        field.width
      );

    const fieldHeight =
      Math.max(
        MIN_HEIGHT,
        field.height
      );

    const maxX =
      Math.max(
        0,
        container.offsetWidth -
          fieldWidth
      );

    const maxY =
      Math.max(
        0,
        container.offsetHeight -
          fieldHeight
      );

    const nextX =
      Math.min(
        maxX,
        Math.max(
          0,
          field.x + deltaX
        )
      );

    const nextY =
      Math.min(
        maxY,
        Math.max(
          0,
          field.y + deltaY
        )
      );

    onUpdate(field.id, {
      x: nextX,
      y: nextY,
    });
  };

  const handlePrecisionPointerDown = (
    event: PointerEvent<HTMLButtonElement>,
    deltaX: number,
    deltaY: number
  ) => {
    event.preventDefault();
    event.stopPropagation();

    onSelect(field.id);

    const step = event.shiftKey
      ? PRECISION_FAST_STEP
      : PRECISION_STEP;

    moveFieldPrecisely(
      deltaX * step,
      deltaY * step
    );
  };

  /*
   * --------------------------------------------------
   * DRAG START
   * --------------------------------------------------
   */
  const handleDragStart = (
    event: PointerEvent<HTMLDivElement>
  ) => {
    const target =
      event.target as HTMLElement;

    /*
     * Do not start dragging when interacting with:
     * 
     * 1. The email input
     * 2. Resize handles
     * 3. Delete button
     * 4. Control buttons
     *
     * The field itself can still be dragged.
     */
    if (
      target.closest(".email-controls") &&
      !target.closest(".field-drag-handle")
    ) {
      return;
    }

    if (
      target.closest(".email-resize-handle") ||
      target.closest(".email-input") ||
      target.closest(".field-delete")
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    onSelect(field.id);

    interactionRef.current = {
      type: "drag",
      pointerId: event.pointerId,

      startX: event.clientX,
      startY: event.clientY,

      initialX: field.x,
      initialY: field.y,

      initialWidth: field.width,
      initialHeight: field.height,
    };

    /*
     * Capture the pointer on the actual field.
     * This keeps dragging stable even if the pointer
     * moves quickly or leaves the small drag handle.
     */
    const fieldElement =
      ((event.target as HTMLElement).closest(
        ".email-field"
      ) as HTMLDivElement | null) ??
      event.currentTarget;

    try {
      fieldElement.setPointerCapture(
        event.pointerId
      );
    } catch {
      // Pointer capture can fail on some browsers.
      // Dragging can still continue through pointer events.
    }
  };

  /*
   * --------------------------------------------------
   * RESIZE START
   * --------------------------------------------------
   */
  const handleResizeStart = (
    event: PointerEvent<HTMLDivElement>,
    direction:
      | "right"
      | "bottom"
      | "corner"
  ) => {
    event.preventDefault();
    event.stopPropagation();

    onSelect(field.id);

    interactionRef.current = {
      type: "resize",
      pointerId: event.pointerId,

      startX: event.clientX,
      startY: event.clientY,

      initialX: field.x,
      initialY: field.y,

      initialWidth: field.width,
      initialHeight: field.height,

      direction,
    };

    try {
      event.currentTarget.setPointerCapture(
        event.pointerId
      );
    } catch {
      // Ignore pointer capture failures.
    }
  };

  /*
   * --------------------------------------------------
   * POINTER MOVE
   * --------------------------------------------------
   */
  const handlePointerMove = (
    event: PointerEvent<HTMLDivElement>
  ) => {
    const state =
      interactionRef.current;

    if (!state) {
      return;
    }

    if (
      state.pointerId !==
      event.pointerId
    ) {
      return;
    }

    /*
     * Resolve the actual field layer instead of
     * relying on event.currentTarget.offsetParent.
     *
     * This is especially important for resize handles.
     */
    const container =
      getInteractionContainer(
        event.currentTarget
      );

    if (!container) {
      return;
    }

    const containerRect =
      container.getBoundingClientRect();

    /*
     * The rendered field layer can be visually scaled
     * on responsive PDF, DOCX and image documents.
     *
     * Convert screen pixels back into document
     * coordinate pixels.
     */
    const scaleX =
      container.offsetWidth > 0
        ? containerRect.width /
          container.offsetWidth
        : 1;

    const scaleY =
      container.offsetHeight > 0
        ? containerRect.height /
          container.offsetHeight
        : 1;

    const safeScaleX =
      Math.max(scaleX, 0.0001);

    const safeScaleY =
      Math.max(scaleY, 0.0001);

    const deltaX =
      event.clientX - state.startX;

    const deltaY =
      event.clientY - state.startY;

    const coordinateDeltaX =
      deltaX / safeScaleX;

    const coordinateDeltaY =
      deltaY / safeScaleY;

    /*
     * --------------------------------------------------
     * DRAG
     * --------------------------------------------------
     */
    if (state.type === "drag") {
      event.preventDefault();
      event.stopPropagation();

      const containerWidth =
        container.offsetWidth;

      const containerHeight =
        container.offsetHeight;

      /*
       * Keep the entire field inside the document.
       */
      const maxX = Math.max(
        0,
        containerWidth -
          state.initialWidth
      );

      const maxY = Math.max(
        0,
        containerHeight -
          state.initialHeight
      );

      const nextX = Math.min(
        maxX,
        Math.max(
          0,
          state.initialX +
            coordinateDeltaX
        )
      );

      const nextY = Math.min(
        maxY,
        Math.max(
          0,
          state.initialY +
            coordinateDeltaY
        )
      );

      onUpdate(field.id, {
        x: nextX,
        y: nextY,
      });

      return;
    }

    /*
     * --------------------------------------------------
     * RESIZE
     * --------------------------------------------------
     */
    if (state.type === "resize") {
      event.preventDefault();
      event.stopPropagation();

      const containerWidth =
        container.offsetWidth;

      const containerHeight =
        container.offsetHeight;

      const maxWidth = Math.max(
        MIN_WIDTH,
        Math.min(
          MAX_WIDTH,
          containerWidth -
            state.initialX
        )
      );

      const maxHeight = Math.max(
        MIN_HEIGHT,
        Math.min(
          MAX_HEIGHT,
          containerHeight -
            state.initialY
        )
      );

      const updates: Partial<DocumentField> =
        {};

      /*
       * RIGHT EDGE
       */
      if (
        state.direction === "right" ||
        state.direction === "corner"
      ) {
        const requestedWidth =
          state.initialWidth +
          coordinateDeltaX;

        updates.width = Math.min(
          maxWidth,
          Math.max(
            MIN_WIDTH,
            requestedWidth
          )
        );
      }

      /*
       * BOTTOM EDGE
       */
      if (
        state.direction === "bottom" ||
        state.direction === "corner"
      ) {
        const requestedHeight =
          state.initialHeight +
          coordinateDeltaY;

        updates.height = Math.min(
          maxHeight,
          Math.max(
            MIN_HEIGHT,
            requestedHeight
          )
        );
      }

      onUpdate(
        field.id,
        updates
      );
    }
  };

  /*
   * --------------------------------------------------
   * POINTER END
   * --------------------------------------------------
   */
  const handlePointerEnd = (
    event: PointerEvent<HTMLDivElement>
  ) => {
    if (
      interactionRef.current
        ?.pointerId ===
      event.pointerId
    ) {
      interactionRef.current = null;
    }

    try {
      if (
        event.currentTarget.hasPointerCapture(
          event.pointerId
        )
      ) {
        event.currentTarget.releasePointerCapture(
          event.pointerId
        );
      }
    } catch {
      // Ignore pointer capture release failures.
    }
  };

  /*
   * --------------------------------------------------
   * INPUT
   * --------------------------------------------------
   */
  const handleInputChange = (
    event: ChangeEvent<HTMLInputElement>
  ) => {
    onUpdate(field.id, {
      value: event.target.value,
    });
  };

  const handleInputFocus = () => {
    onSelect(field.id);
    setIsEditing(true);
  };

  const handleInputBlur = () => {
    setIsEditing(false);
  };

  /*
   * --------------------------------------------------
   * DELETE
   * --------------------------------------------------
   */
  const handleDelete = (
    event: PointerEvent<HTMLButtonElement>
  ) => {
    event.preventDefault();
    event.stopPropagation();

    interactionRef.current = null;

    onDelete(field.id);
  };

  /*
   * --------------------------------------------------
   * RENDER
   * --------------------------------------------------
   */
  return (
    <div
      ref={fieldRef}
      className={`email-field ${
        selected
          ? "email-field-selected"
          : ""
      }`}
      style={{
        left: field.x,
        top: field.y,
        width: Math.max(
          MIN_WIDTH,
          field.width
        ),
        height: Math.max(
          MIN_HEIGHT,
          field.height
        ),
        touchAction: "auto",
      }}
      onPointerDown={
        handleDragStart
      }
      onPointerMove={
        handlePointerMove
      }
      onPointerUp={
        handlePointerEnd
      }
      onPointerCancel={
        handlePointerEnd
      }
      onClick={(event) =>
        event.stopPropagation()
      }
    >
      {selected && (
        <div
          className="email-controls"
          onPointerDown={(event) =>
            event.stopPropagation()
          }
          onClick={(event) =>
            event.stopPropagation()
          }
        >
          {/*
           * MOVE IDENTIFIER
           *
           * This stays visible whenever the field
           * is selected.
           */}
          <div
            className="field-drag-handle"
            role="button"
            tabIndex={0}
            aria-label="Move email field"
            title="Drag to move"
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();

              handleDragStart(event);
            }}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" ||
                event.key === " "
              ) {
                event.preventDefault();
              }
            }}
          >
            ⋮⋮
          </div>

          <span className="email-control-label">
            Email
          </span>

          {/*
           * DELETE
           *
           * This is separate from the MOVE handle.
           */}
          <button
            type="button"
            className="field-delete email-delete-button"
            onPointerDown={
              handleDelete
            }
            aria-label="Delete email field"
            title="Delete email field"
          >
            ×
          </button>
        </div>
      )}

      {selected && isCoarsePointer && (
        <div
          className="field-controls field-precision-controller"
          style={{
            position: "absolute",
            left: "clamp(70px, 50%, calc(100% - 70px))",
            top: precisionAbove
              ? `-${PRECISION_CONTROLLER_HEIGHT + PRECISION_CONTROLLER_MARGIN}px`
              : `calc(100% + ${PRECISION_CONTROLLER_MARGIN}px)`,
            transform: "translateX(-50%)",
            pointerEvents: "none",
            zIndex: 7000,
            touchAction: "none",
          }}
          onPointerDown={(event) =>
            event.stopPropagation()
          }
          onClick={(event) =>
            event.stopPropagation()
          }
        >
          <div
            style={{
              pointerEvents: "auto",
              display: "grid",
              gridTemplateColumns:
                "repeat(3, 42px)",
              gridTemplateRows:
                "repeat(2, 36px)",
              gap: "4px",
              alignItems: "center",
              justifyItems: "center",
              padding: "5px",
              borderRadius: "10px",
              background:
                "rgba(24, 24, 24, 0.96)",
              boxShadow:
                "0 8px 24px rgba(0,0,0,0.28)",
            }}
          >
            <span aria-hidden="true" />

            <button
              type="button"
              aria-label="Move email field up"
              title="Move up 2px (Shift: 10px)"
              onPointerDown={(event) =>
                handlePrecisionPointerDown(
                  event,
                  0,
                  -1
                )
              }
              style={{
                width: "42px",
                height: "36px",
                touchAction: "none",
                cursor: "pointer",
              }}
            >
              ↑
            </button>

            <span aria-hidden="true" />

            <button
              type="button"
              aria-label="Move email field left"
              title="Move left 2px (Shift: 10px)"
              onPointerDown={(event) =>
                handlePrecisionPointerDown(
                  event,
                  -1,
                  0
                )
              }
              style={{
                width: "42px",
                height: "36px",
                touchAction: "none",
                cursor: "pointer",
              }}
            >
              ←
            </button>

            <div
              style={{
                minWidth: "42px",
                textAlign: "center",
                color: "#fff",
                fontSize: "9px",
                lineHeight: 1.15,
                userSelect: "none",
                pointerEvents: "none",
              }}
            >
              <div>
                X {Math.round(field.x)}
              </div>
              <div>
                Y {Math.round(field.y)}
              </div>
            </div>

            <button
              type="button"
              aria-label="Move email field right"
              title="Move right 2px (Shift: 10px)"
              onPointerDown={(event) =>
                handlePrecisionPointerDown(
                  event,
                  1,
                  0
                )
              }
              style={{
                width: "42px",
                height: "36px",
                touchAction: "none",
                cursor: "pointer",
              }}
            >
              →
            </button>

            <span aria-hidden="true" />

            <button
              type="button"
              aria-label="Move email field down"
              title="Move down 2px (Shift: 10px)"
              onPointerDown={(event) =>
                handlePrecisionPointerDown(
                  event,
                  0,
                  1
                )
              }
              style={{
                width: "42px",
                height: "36px",
                touchAction: "none",
                cursor: "pointer",
              }}
            >
              ↓
            </button>

            <span aria-hidden="true" />
          </div>
        </div>
      )}

      {/*
       * EMAIL INPUT
       */}
      <div className="email-input-wrapper">
        <input
          type="email"
          className={`email-input ${
            isEditing
              ? "email-input-editing"
              : ""
          }`}
          value={field.value}
          placeholder="Email address"
          onChange={
            handleInputChange
          }
          onFocus={
            handleInputFocus
          }
          onBlur={
            handleInputBlur
          }
          onPointerDown={(event) =>
            event.stopPropagation()
          }
          onClick={(event) =>
            event.stopPropagation()
          }
          aria-label="Email address"
        />
      </div>

      {/*
       * RESIZE HANDLES
       */}
      {selected && (
        <>
          {/* RIGHT */}
          <div
            className="email-resize-handle email-resize-right"
            onPointerDown={(event) =>
              handleResizeStart(
                event,
                "right"
              )
            }
            onPointerMove={
              handlePointerMove
            }
            onPointerUp={
              handlePointerEnd
            }
            onPointerCancel={
              handlePointerEnd
            }
          />

          {/* BOTTOM */}
          <div
            className="email-resize-handle email-resize-bottom"
            onPointerDown={(event) =>
              handleResizeStart(
                event,
                "bottom"
              )
            }
            onPointerMove={
              handlePointerMove
            }
            onPointerUp={
              handlePointerEnd
            }
            onPointerCancel={
              handlePointerEnd
            }
          />

          {/* CORNER */}
          <div
            className="email-resize-handle email-resize-corner"
            onPointerDown={(event) =>
              handleResizeStart(
                event,
                "corner"
              )
            }
            onPointerMove={
              handlePointerMove
            }
            onPointerUp={
              handlePointerEnd
            }
            onPointerCancel={
              handlePointerEnd
            }
          />
        </>
      )}
    </div>
  );
}
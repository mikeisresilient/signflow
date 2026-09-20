import { useRef, useState } from "react";

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

export default function EmailField({
  field,
  selected,
  onUpdate,
  onDelete,
  onSelect,
}: EmailFieldProps) {
  const interactionRef =
    useRef<InteractionState | null>(null);

  const [isEditing, setIsEditing] = useState(false);

  /*
   * --------------------------------------------------
   * GET FIELD PARENT
   * --------------------------------------------------
   */

  const getParentElement = (
    element: HTMLElement
  ): HTMLElement | null => {
    return element.offsetParent as HTMLElement | null;
  };

  /*
   * --------------------------------------------------
   * GET RESPONSIVE SCALE
   * --------------------------------------------------
   *
   * The editor can visually shrink on smaller screens.
   * Field coordinates remain in the editor's internal
   * coordinate system, so pointer movement must be
   * converted back into that coordinate system.
   */

  const getScale = (
    parent: HTMLElement
  ) => {
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

    return {
      x: Math.max(scaleX, 0.0001),
      y: Math.max(scaleY, 0.0001),
    };
  };

  /*
   * --------------------------------------------------
   * DRAG
   * --------------------------------------------------
   */

  const handleDragStart = (
    event: React.PointerEvent<HTMLDivElement>
  ) => {
    const target =
      event.target as HTMLElement;

    /*
     * The MOVE handle is always allowed to initiate
     * dragging.
     *
     * Inputs, controls, delete button and resize
     * handles must keep their own interactions.
     */
    const isMoveHandle =
      Boolean(
        target.closest(
          ".field-drag-handle"
        )
      );

    if (
      !isMoveHandle &&
      (
        target.closest(".email-controls") ||
        target.closest(
          ".email-resize-handle"
        ) ||
        target.closest(".email-input") ||
        target.closest(".field-delete")
      )
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
     * Capture the pointer on the field itself so dragging
     * continues smoothly even if the pointer leaves the
     * visible field.
     */
    event.currentTarget.setPointerCapture(
      event.pointerId
    );
  };

  /*
   * --------------------------------------------------
   * RESIZE START
   * --------------------------------------------------
   */

  const handleResizeStart = (
    event: React.PointerEvent<HTMLDivElement>,
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

    event.currentTarget.setPointerCapture(
      event.pointerId
    );
  };

  /*
   * --------------------------------------------------
   * POINTER MOVE
   * --------------------------------------------------
   */

  const handlePointerMove = (
    event: React.PointerEvent<HTMLDivElement>
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

    event.preventDefault();
    event.stopPropagation();

    const deltaX =
      event.clientX - state.startX;

    const deltaY =
      event.clientY - state.startY;

    const parent =
      getParentElement(
        event.currentTarget
      );

    if (!parent) {
      return;
    }

    const scale =
      getScale(parent);

    /*
     * Convert screen pixels into the editor's
     * internal coordinate system.
     */
    const coordinateDeltaX =
      deltaX / scale.x;

    const coordinateDeltaY =
      deltaY / scale.y;

    /*
     * --------------------------------------------------
     * DRAG
     * --------------------------------------------------
     */

    if (state.type === "drag") {
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

    const updates: Partial<DocumentField> =
      {};

    const maxWidth = Math.max(
      MIN_WIDTH,
      parent.offsetWidth -
        state.initialX
    );

    const maxHeight = Math.max(
      MIN_HEIGHT,
      parent.offsetHeight -
        state.initialY
    );

    /*
     * Right handle
     */
    if (
      state.direction === "right" ||
      state.direction === "corner"
    ) {
      const nextWidth = Math.min(
        maxWidth,
        Math.max(
          MIN_WIDTH,
          state.initialWidth +
            coordinateDeltaX
        )
      );

      updates.width = nextWidth;
    }

    /*
     * Bottom handle
     */
    if (
      state.direction === "bottom" ||
      state.direction === "corner"
    ) {
      const nextHeight = Math.min(
        maxHeight,
        Math.max(
          MIN_HEIGHT,
          state.initialHeight +
            coordinateDeltaY
        )
      );

      updates.height = nextHeight;
    }

    onUpdate(
      field.id,
      updates
    );
  };

  /*
   * --------------------------------------------------
   * POINTER END
   * --------------------------------------------------
   */

  const handlePointerEnd = (
    event: React.PointerEvent<HTMLDivElement>
  ) => {
    if (
      interactionRef.current
        ?.pointerId ===
      event.pointerId
    ) {
      interactionRef.current = null;
    }

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
   * --------------------------------------------------
   * INPUT
   * --------------------------------------------------
   */

  const handleInputChange = (
    event: React.ChangeEvent<HTMLInputElement>
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
    event: React.PointerEvent<HTMLButtonElement>
  ) => {
    event.preventDefault();
    event.stopPropagation();

    onDelete(field.id);
  };

  /*
   * --------------------------------------------------
   * RENDER
   * --------------------------------------------------
   */

  return (
    <div
      className={`email-field ${
        selected
          ? "email-field-selected"
          : ""
      }`}
      style={{
        position: "absolute",
        left: field.x,
        top: field.y,
        width: field.width,
        height: field.height,
        touchAction: "none",
        boxSizing: "border-box",
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
        <>
          {/* ---------------------------------------- */}
          {/* MOVE HANDLE                              */}
          {/* ---------------------------------------- */}

          <div
            className="field-drag-handle email-drag-handle"
            role="button"
            aria-label="Move email field"
            title="Drag to move email field"
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();

              handleDragStart(
                event as React.PointerEvent<HTMLDivElement>
              );
            }}
            onPointerMove={
              handlePointerMove
            }
            onPointerUp={
              handlePointerEnd
            }
            onPointerCancel={
              handlePointerEnd
            }
          >
            ⋮⋮ MOVE
          </div>

          {/* ---------------------------------------- */}
          {/* CONTROLS                                 */}
          {/* ---------------------------------------- */}

          <div
            className="email-controls"
            onPointerDown={(event) =>
              event.stopPropagation()
            }
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <span className="email-control-label">
              Email
            </span>

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
        </>
      )}

      {/* ---------------------------------------- */}
      {/* EMAIL INPUT                              */}
      {/* ---------------------------------------- */}

      <div
        className="email-input-wrapper"
        style={{
          width: "100%",
          height: "100%",
        }}
      >
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
          style={{
            width: "100%",
            height: "100%",
            boxSizing: "border-box",
          }}
        />
      </div>

      {/* ---------------------------------------- */}
      {/* RESIZE HANDLES                           */}
      {/* ---------------------------------------- */}

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
            aria-label="Resize email field horizontally"
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
            aria-label="Resize email field vertically"
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
            aria-label="Resize email field"
          />
        </>
      )}
    </div>
  );
}
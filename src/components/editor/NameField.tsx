import { useRef, useState } from "react";

import type { DocumentField } from "../../types/document";

interface NameFieldProps {
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

  direction?:
    | "right"
    | "bottom"
    | "corner";
}

export default function NameField({
  field,
  selected,
  onUpdate,
  onDelete,
  onSelect,
}: NameFieldProps) {
  const interactionRef =
    useRef<InteractionState | null>(null);

  const [isEditing, setIsEditing] =
    useState(false);

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

    if (
      !target.closest(".field-drag-handle") &&
      (
        target.closest(".name-controls") ||
        target.closest(".name-resize-handle") ||
      target.closest(".name-input") ||
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

    const fieldElement =
      ((event.target as HTMLElement).closest(
        ".name-field"
      ) as HTMLDivElement | null) ??
      event.currentTarget;

    fieldElement.setPointerCapture(
      event.pointerId
    );
  };

  /*
   * --------------------------------------------------
   * RESIZE
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

    const deltaX =
      event.clientX - state.startX;

    const deltaY =
      event.clientY - state.startY;

    /*
     * DRAG
     */

    if (state.type === "drag") {
      event.preventDefault();
      event.stopPropagation();

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
            state.initialX +
              coordinateDeltaX
          )
        ),

        y: Math.min(
          maxY,
          Math.max(
            0,
            state.initialY +
              coordinateDeltaY
          )
        ),
      });

      return;
    }

    /*
     * RESIZE
     */

    const updates: Partial<DocumentField> =
      {};

    if (
      state.direction === "right" ||
      state.direction === "corner"
    ) {
      updates.width = Math.max(
        80,
        state.initialWidth + deltaX
      );
    }

    if (
      state.direction === "bottom" ||
      state.direction === "corner"
    ) {
      updates.height = Math.max(
        32,
        state.initialHeight + deltaY
      );
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
      className={`name-field ${
        selected
          ? "name-field-selected"
          : ""
      }`}
      style={{
        left: field.x,
        top: field.y,
        width: field.width,
        height: field.height,
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
          className="name-controls"
          onPointerDown={(event) =>
            event.stopPropagation()
          }
          onClick={(event) =>
            event.stopPropagation()
          }
        >
          <div
            className="field-drag-handle"
            role="button"
style={{
                position: "absolute",
                top: "-30px",
                right: "4px",
                width: "28px",
                height: "22px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 0,
                border: "1px solid #d8d8d3",
                borderRadius: "6px",
                background: "#ffffff",
                boxShadow: "0 2px 8px rgba(0, 0, 0, 0.12)",
                zIndex: 300,
                touchAction: "none",
                userSelect: "none",
                cursor: "grab",
                lineHeight: 1,
              }}
            aria-label="Move field"
            title="Drag to move"
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              handleDragStart(
                event
              );
            }}
          >
            ⋮⋮
          </div>

          <span className="name-control-label">
            Name
          </span>

          <button
            type="button"
            className="field-delete name-delete-button"
            onPointerDown={
              handleDelete
            }
            aria-label="Delete name field"
            title="Delete name field"
          >
            ×
          </button>
        </div>
      )}

      <div className="name-input-wrapper">
        <input
          type="text"
          className={`name-input ${
            isEditing
              ? "name-input-editing"
              : ""
          }`}
          value={field.value}
          placeholder="Full name"
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
          aria-label="Name"
        />
      </div>

      {selected && (
        <>
          <div
            className="name-resize-handle name-resize-right"
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

          <div
            className="name-resize-handle name-resize-bottom"
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

          <div
            className="name-resize-handle name-resize-corner"
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
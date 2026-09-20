import { useRef } from "react";
import { Check } from "lucide-react";

import type { DocumentField } from "../../types/document";

interface CheckboxFieldProps {
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

interface ButtonGestureState {
  pointerId: number;
  startX: number;
  startY: number;

  initialX: number;
  initialY: number;

  moved: boolean;
}

const DRAG_THRESHOLD = 4;

export default function CheckboxField({
  field,
  selected,
  onUpdate,
  onDelete,
  onSelect,
}: CheckboxFieldProps) {
  const interactionRef =
    useRef<InteractionState | null>(null);

  const buttonGestureRef =
    useRef<ButtonGestureState | null>(null);

  const isChecked =
    field.value === "true";

  /*
   * --------------------------------------------------
   * TOGGLE
   * --------------------------------------------------
   */

  const toggleCheckbox = () => {
    onUpdate(field.id, {
      value: isChecked
        ? "false"
        : "true",
    });
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
   * DRAG FROM FIELD
   * --------------------------------------------------
   */

  const handleFieldPointerDown = (
    event: React.PointerEvent<HTMLDivElement>
  ) => {
    const target =
      event.target as HTMLElement;

    /*
     * These elements have their own pointer
     * interactions.
     */
    if (
      target.closest(".checkbox-controls") ||
      target.closest(".checkbox-resize-handle") ||
      target.closest(".checkbox-button")
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
        ".checkbox-field"
      ) as HTMLDivElement | null) ??
      event.currentTarget;

    fieldElement.setPointerCapture(
      event.pointerId
    );
  };

  /*
   * --------------------------------------------------
   * DRAG FROM CHECKBOX ITSELF
   *
   * A short click toggles.
   * A movement greater than the threshold drags.
   * --------------------------------------------------
   */

  const handleCheckboxPointerDown = (
    event: React.PointerEvent<HTMLButtonElement>
  ) => {
    event.preventDefault();
    event.stopPropagation();

    onSelect(field.id);

    buttonGestureRef.current = {
      pointerId: event.pointerId,

      startX: event.clientX,
      startY: event.clientY,

      initialX: field.x,
      initialY: field.y,

      moved: false,
    };

    event.currentTarget.setPointerCapture(
      event.pointerId
    );
  };

  const handleCheckboxPointerMove = (
    event: React.PointerEvent<HTMLButtonElement>
  ) => {
    const gesture =
      buttonGestureRef.current;

    if (!gesture) {
      return;
    }

    if (
      gesture.pointerId !==
      event.pointerId
    ) {
      return;
    }

    const deltaX =
      event.clientX - gesture.startX;

    const deltaY =
      event.clientY - gesture.startY;

    const distance =
      Math.sqrt(
        deltaX * deltaX +
        deltaY * deltaY
      );

    /*
     * Don't start dragging until the pointer
     * has moved enough to distinguish a drag
     * from a normal checkbox click.
     */
    if (
      !gesture.moved &&
      distance < DRAG_THRESHOLD
    ) {
      return;
    }

    gesture.moved = true;

    event.preventDefault();
    event.stopPropagation();

    const parent =
      event.currentTarget
        .parentElement
        ?.parentElement
        ?.offsetParent as HTMLElement | null;

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
          gesture.initialX +
            coordinateDeltaX
        )
      ),
      y: Math.min(
        maxY,
        Math.max(
          0,
          gesture.initialY +
            coordinateDeltaY
        )
      ),
    });
  };

  const handleCheckboxPointerUp = (
    event: React.PointerEvent<HTMLButtonElement>
  ) => {
    const gesture =
      buttonGestureRef.current;

    if (!gesture) {
      return;
    }

    if (
      gesture.pointerId !==
      event.pointerId
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    /*
     * If the pointer did not move, this was
     * a normal click, so toggle the checkbox.
     *
     * If it moved, it was a drag and we do
     * not toggle.
     */
    if (!gesture.moved) {
      toggleCheckbox();
    }

    buttonGestureRef.current = null;

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

  const handleCheckboxPointerCancel = (
    event: React.PointerEvent<HTMLButtonElement>
  ) => {
    if (
      buttonGestureRef.current
        ?.pointerId ===
      event.pointerId
    ) {
      buttonGestureRef.current = null;
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
   * DRAG / RESIZE MOVE
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

    const maxWidth = Math.max(
      24,
      parent.offsetWidth - state.initialX
    );

    const maxHeight = Math.max(
      24,
      parent.offsetHeight - state.initialY
    );

    const updates: Partial<DocumentField> =
      {};

    if (
      state.direction === "right" ||
      state.direction === "corner"
    ) {
      updates.width = Math.min(
        maxWidth,
        Math.max(
          24,
          state.initialWidth +
            coordinateDeltaX
        )
      );
    }

    if (
      state.direction === "bottom" ||
      state.direction === "corner"
    ) {
      updates.height = Math.min(
        maxHeight,
        Math.max(
          24,
          state.initialHeight +
            coordinateDeltaY
        )
      );
    }

    onUpdate(
      field.id,
      updates
    );
  };

  /*
   * --------------------------------------------------
   * DRAG / RESIZE END
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
   * RENDER
   * --------------------------------------------------
   */

  return (
    <div
      className={`checkbox-field ${
        selected
          ? "checkbox-field-selected"
          : ""
      }`}
      style={{
        left: field.x,
        top: field.y,
        width: field.width,
        height: field.height,
      }}
      onPointerDown={
        handleFieldPointerDown
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
          <div
            className="field-drag-handle checkbox-drag-handle"
            role="button"
            aria-label="Move checkbox field"
            title="Drag to move"
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              handleFieldPointerDown(
                event
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
            ⋮⋮
          </div>

          <div
            className="checkbox-controls"
          onPointerDown={(event) =>
            event.stopPropagation()
          }
          onClick={(event) =>
            event.stopPropagation()
          }
        >
          <span className="checkbox-control-label">
            Checkbox
          </span>

          <button
            type="button"
            className="field-delete checkbox-delete-button"
            onPointerDown={
              handleDelete
            }
            aria-label="Delete checkbox"
            title="Delete checkbox"
          >
            ×
          </button>
        </div>
        </>
      )}

      <div className="checkbox-drag-area">
        <button
          type="button"
          className={`checkbox-button ${
            isChecked
              ? "checkbox-button-checked"
              : ""
          }`}
          onPointerDown={
            handleCheckboxPointerDown
          }
          onPointerMove={
            handleCheckboxPointerMove
          }
          onPointerUp={
            handleCheckboxPointerUp
          }
          onPointerCancel={
            handleCheckboxPointerCancel
          }
          aria-label={
            isChecked
              ? "Uncheck checkbox"
              : "Check checkbox"
          }
        >
          {isChecked && (
            <Check
              size={Math.max(
                14,
                Math.min(
                  field.width,
                  field.height
                ) * 0.65
              )}
              strokeWidth={3}
            />
          )}
        </button>
      </div>

      {selected && (
        <>
          <div
            className="checkbox-resize-handle checkbox-resize-right"
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
            className="checkbox-resize-handle checkbox-resize-bottom"
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
            className="checkbox-resize-handle checkbox-resize-corner"
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
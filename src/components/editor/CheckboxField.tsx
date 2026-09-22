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

  direction?: "right" | "bottom" | "corner";
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

const MIN_SIZE = 24;

const getInteractionLayer = (
  element: HTMLElement | null
): HTMLElement | null => {
  if (!element) {
    return null;
  }

  const fieldElement =
    element.closest(
      ".checkbox-field"
    ) as HTMLElement | null;

  if (fieldElement?.parentElement) {
    return fieldElement.parentElement;
  }

  let currentElement:
    | HTMLElement
    | null = element.parentElement;

  while (currentElement) {
    const classNameValue =
      typeof currentElement.className === "string"
        ? currentElement.className
        : "";

    if (
      classNameValue.includes(
        "field-layer"
      ) ||
      classNameValue.includes(
        "docx-field-layer"
      ) ||
      classNameValue.includes(
        "image-field-layer"
      )
    ) {
      return currentElement;
    }

    currentElement =
      currentElement.parentElement;
  }

  return null;
};

const getCoordinateScale = (
  layer: HTMLElement
) => {
  const rect =
    layer.getBoundingClientRect();

  const scaleX =
    layer.offsetWidth > 0
      ? rect.width /
        layer.offsetWidth
      : 1;

  const scaleY =
    layer.offsetHeight > 0
      ? rect.height /
        layer.offsetHeight
      : 1;

  return {
    x:
      Number.isFinite(scaleX) &&
      scaleX > 0
        ? scaleX
        : 1,
    y:
      Number.isFinite(scaleY) &&
      scaleY > 0
        ? scaleY
        : 1,
  };
};

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
   * FIELD DRAG
   * --------------------------------------------------
   */

  const handleFieldPointerDown = (
    event: React.PointerEvent<HTMLDivElement>
  ) => {
    const target =
      event.target instanceof HTMLElement
        ? event.target
        : null;

    if (
      target?.closest(
        ".checkbox-controls"
      ) ||
      target?.closest(
        ".checkbox-resize-handle"
      ) ||
      target?.closest(
        ".checkbox-button"
      ) ||
      target?.closest(
        ".field-delete"
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
      (target?.closest(
        ".checkbox-field"
      ) as HTMLDivElement | null) ??
      event.currentTarget;

    try {
      fieldElement.setPointerCapture(
        event.pointerId
      );
    } catch {
      // Ignore unsupported pointer capture.
    }
  };

  /*
   * --------------------------------------------------
   * DRAG FROM CHECKBOX ITSELF
   *
   * Short click toggles.
   * Movement beyond threshold drags.
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

    try {
      event.currentTarget.setPointerCapture(
        event.pointerId
      );
    } catch {
      // Ignore unsupported pointer capture.
    }
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
      event.clientX -
      gesture.startX;

    const deltaY =
      event.clientY -
      gesture.startY;

    const distance = Math.sqrt(
      deltaX * deltaX +
        deltaY * deltaY
    );

    if (
      !gesture.moved &&
      distance < DRAG_THRESHOLD
    ) {
      return;
    }

    gesture.moved = true;

    event.preventDefault();
    event.stopPropagation();

    const checkboxElement =
      event.currentTarget.closest(
        ".checkbox-field"
      ) as HTMLElement | null;

    const parent =
      getInteractionLayer(
        checkboxElement ??
          event.currentTarget
      );

    if (!parent) {
      return;
    }

    const parentRect =
      parent.getBoundingClientRect();

    const scale =
      getCoordinateScale(parent);

    const coordinateDeltaX =
      deltaX /
      Math.max(
        scale.x,
        0.0001
      );

    const coordinateDeltaY =
      deltaY /
      Math.max(
        scale.y,
        0.0001
      );

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

    const newX =
      gesture.initialX +
      coordinateDeltaX;

    const newY =
      gesture.initialY +
      coordinateDeltaY;

    /*
     * parentRect is intentionally read here so
     * the browser keeps the coordinate relationship
     * synchronized with the transformed field layer.
     */
    void parentRect;

    onUpdate(field.id, {
      x: Math.min(
        maxX,
        Math.max(
          0,
          newX
        )
      ),
      y: Math.min(
        maxY,
        Math.max(
          0,
          newY
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

    if (!gesture.moved) {
      toggleCheckbox();
    }

    buttonGestureRef.current =
      null;

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
      // Ignore unsupported pointer capture.
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
      buttonGestureRef.current =
        null;
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
      // Ignore unsupported pointer capture.
    }
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

    try {
      event.currentTarget.setPointerCapture(
        event.pointerId
      );
    } catch {
      // Ignore unsupported pointer capture.
    }
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
      event.clientX -
      state.startX;

    const deltaY =
      event.clientY -
      state.startY;

    /*
     * ------------------------------------------------
     * DRAG
     * ------------------------------------------------
     */

    if (state.type === "drag") {
      event.preventDefault();
      event.stopPropagation();

      const fieldElement =
        (event.currentTarget.closest(
          ".checkbox-field"
        ) as HTMLElement | null) ??
        event.currentTarget;

      const parent =
        getInteractionLayer(
          fieldElement
        );

      if (!parent) {
        return;
      }

      const scale =
        getCoordinateScale(
          parent
        );

      const coordinateDeltaX =
        deltaX /
        Math.max(
          scale.x,
          0.0001
        );

      const coordinateDeltaY =
        deltaY /
        Math.max(
          scale.y,
          0.0001
        );

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

      const newX =
        state.initialX +
        coordinateDeltaX;

      const newY =
        state.initialY +
        coordinateDeltaY;

      onUpdate(field.id, {
        x: Math.min(
          maxX,
          Math.max(
            0,
            newX
          )
        ),

        y: Math.min(
          maxY,
          Math.max(
            0,
            newY
          )
        ),
      });

      return;
    }

    /*
     * ------------------------------------------------
     * RESIZE
     * ------------------------------------------------
     */

    event.preventDefault();
    event.stopPropagation();

    const fieldElement =
      (event.currentTarget.closest(
        ".checkbox-field"
      ) as HTMLElement | null) ??
      event.currentTarget;

    const parent =
      getInteractionLayer(
        fieldElement
      );

    if (!parent) {
      return;
    }

    const scale =
      getCoordinateScale(
        parent
      );

    const coordinateDeltaX =
      deltaX /
      Math.max(
        scale.x,
        0.0001
      );

    const coordinateDeltaY =
      deltaY /
      Math.max(
        scale.y,
        0.0001
      );

    const maxWidth =
      Math.max(
        MIN_SIZE,
        parent.offsetWidth -
          state.initialX
      );

    const maxHeight =
      Math.max(
        MIN_SIZE,
        parent.offsetHeight -
          state.initialY
      );

    const updates:
      Partial<DocumentField> =
      {};

    /*
     * Right edge
     */
    if (
      state.direction ===
        "right" ||
      state.direction ===
        "corner"
    ) {
      const nextWidth =
        state.initialWidth +
        coordinateDeltaX;

      updates.width =
        Math.min(
          maxWidth,
          Math.max(
            MIN_SIZE,
            nextWidth
          )
        );
    }

    /*
     * Bottom edge
     */
    if (
      state.direction ===
        "bottom" ||
      state.direction ===
        "corner"
    ) {
      const nextHeight =
        state.initialHeight +
        coordinateDeltaY;

      updates.height =
        Math.min(
          maxHeight,
          Math.max(
            MIN_SIZE,
            nextHeight
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
      interactionRef.current =
        null;
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
      // Ignore unsupported pointer capture.
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

        touchAction: "none",
        overflow: "visible",
        boxSizing: "border-box",
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
            tabIndex={0}
            aria-label="Move checkbox field"
            title="Drag to move"
            onPointerDown={(
              event
            ) => {
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
            onPointerDown={(
              event
            ) => {
              handleResizeStart(
                event,
                "right"
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
          />

          <div
            className="checkbox-resize-handle checkbox-resize-bottom"
            onPointerDown={(
              event
            ) => {
              handleResizeStart(
                event,
                "bottom"
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
          />

          <div
            className="checkbox-resize-handle checkbox-resize-corner"
            onPointerDown={(
              event
            ) => {
              handleResizeStart(
                event,
                "corner"
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
          />
        </>
      )}
    </div>
  );
}
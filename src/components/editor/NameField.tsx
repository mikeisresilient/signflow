import {
  useRef,
  useState,
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import type { DocumentField } from "../../types/document";

interface NameFieldProps {
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

interface InteractionState {
  type: "drag" | "resize";
  pointerId: number;

  startX: number;
  startY: number;

  initialX: number;
  initialY: number;

  initialWidth: number;
  initialHeight: number;

  direction?: ResizeDirection;
}

const MIN_WIDTH = 120;
const MIN_HEIGHT = 32;

const MAX_WIDTH = 700;
const MAX_HEIGHT = 300;

/*
 * Resolve the actual document field
 * layer rather than relying directly
 * on the resize handle's offsetParent.
 *
 * This is important because a resize
 * handle is itself absolutely positioned
 * inside the field.
 */
function getInteractionContainer(
  element: HTMLElement,
): HTMLElement | null {
  const fieldElement =
    element.closest(
      ".name-field",
    ) as HTMLElement | null;

  if (fieldElement?.parentElement) {
    return fieldElement.parentElement;
  }

  let currentElement: HTMLElement | null =
    element.parentElement;

  while (currentElement) {
    const classNameValue =
      typeof currentElement.className ===
      "string"
        ? currentElement.className
        : "";

    const classNames =
      classNameValue.split(/\s+/);

    if (
      classNames.includes(
        "field-layer",
      ) ||
      classNames.includes(
        "docx-field-layer",
      ) ||
      classNames.includes(
        "image-field-layer",
      )
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
}

/*
 * Calculate the visual scale between
 * the internal document coordinate
 * system and what is displayed on screen.
 */
function getContainerScale(
  container: HTMLElement,
): {
  x: number;
  y: number;
} {
  const rect =
    container.getBoundingClientRect();

  const scaleX =
    container.offsetWidth > 0
      ? rect.width /
        container.offsetWidth
      : 1;

  const scaleY =
    container.offsetHeight > 0
      ? rect.height /
        container.offsetHeight
      : 1;

  return {
    x: Math.max(scaleX, 0.0001),
    y: Math.max(scaleY, 0.0001),
  };
}

export default function NameField({
  field,
  selected,
  onUpdate,
  onDelete,
  onSelect,
}: NameFieldProps) {
  const interactionRef =
    useRef<InteractionState | null>(
      null,
    );

  const [isEditing, setIsEditing] =
    useState(false);

  /*
   * --------------------------------------------------
   * DRAG START
   * --------------------------------------------------
   *
   * Only the visible MOVE handle
   * initiates a field drag.
   *
   * This prevents typing inside the
   * input from accidentally moving the
   * field on desktop or mobile.
   */
  const handleDragStart = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    const target =
      event.target as HTMLElement;

    const isDragHandle =
      Boolean(
        target.closest(
          ".field-drag-handle",
        ),
      );

    if (!isDragHandle) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    onSelect(field.id);

    interactionRef.current = {
      type: "drag",
      pointerId:
        event.pointerId,
      startX:
        event.clientX,
      startY:
        event.clientY,
      initialX:
        field.x,
      initialY:
        field.y,
      initialWidth:
        Math.max(
          MIN_WIDTH,
          field.width,
        ),
      initialHeight:
        Math.max(
          MIN_HEIGHT,
          field.height,
        ),
    };

    const fieldElement =
      ((event.target as HTMLElement).closest(
        ".name-field",
      ) as HTMLDivElement | null) ??
      event.currentTarget;

    fieldElement.setPointerCapture(
      event.pointerId,
    );
  };

  /*
   * --------------------------------------------------
   * RESIZE START
   * --------------------------------------------------
   */
  const handleResizeStart = (
    event: ReactPointerEvent<HTMLDivElement>,
    direction: ResizeDirection,
  ) => {
    event.preventDefault();
    event.stopPropagation();

    onSelect(field.id);

    interactionRef.current = {
      type: "resize",
      pointerId:
        event.pointerId,
      startX:
        event.clientX,
      startY:
        event.clientY,
      initialX:
        field.x,
      initialY:
        field.y,
      initialWidth:
        Math.max(
          MIN_WIDTH,
          field.width,
        ),
      initialHeight:
        Math.max(
          MIN_HEIGHT,
          field.height,
        ),
      direction,
    };

    event.currentTarget.setPointerCapture(
      event.pointerId,
    );
  };

  /*
   * --------------------------------------------------
   * POINTER MOVE
   * --------------------------------------------------
   */
  const handlePointerMove = (
    event: ReactPointerEvent<HTMLDivElement>,
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
     * ------------------------------------------------
     * DRAG
     * ------------------------------------------------
     */
    if (
      state.type === "drag"
    ) {
      event.preventDefault();
      event.stopPropagation();

      const container =
        getInteractionContainer(
          event.currentTarget,
        );

      if (!container) {
        return;
      }

      const containerRect =
        container.getBoundingClientRect();

      const scale =
        getContainerScale(
          container,
        );

      const coordinateDeltaX =
        (
          event.clientX -
          state.startX
        ) / scale.x;

      const coordinateDeltaY =
        (
          event.clientY -
          state.startY
        ) / scale.y;

      const fieldWidth =
        Math.max(
          MIN_WIDTH,
          state.initialWidth,
        );

      const fieldHeight =
        Math.max(
          MIN_HEIGHT,
          state.initialHeight,
        );

      /*
       * Keep the field inside the
       * actual document bounds.
       */
      const maxX =
        Math.max(
          0,
          container.offsetWidth -
            fieldWidth,
        );

      const maxY =
        Math.max(
          0,
          container.offsetHeight -
            fieldHeight,
        );

      /*
       * containerRect is intentionally
       * read above so the browser keeps
       * the coordinate calculation tied
       * to the displayed document.
       */
      void containerRect;

      const nextX =
        Math.min(
          maxX,
          Math.max(
            0,
            state.initialX +
              coordinateDeltaX,
          ),
        );

      const nextY =
        Math.min(
          maxY,
          Math.max(
            0,
            state.initialY +
              coordinateDeltaY,
          ),
        );

      onUpdate(
        field.id,
        {
          x: nextX,
          y: nextY,
        },
      );

      return;
    }

    /*
     * ------------------------------------------------
     * RESIZE
     * ------------------------------------------------
     */
    const container =
      getInteractionContainer(
        event.currentTarget,
      );

    if (!container) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const scale =
      getContainerScale(
        container,
      );

    const deltaX =
      (
        event.clientX -
        state.startX
      ) / scale.x;

    const deltaY =
      (
        event.clientY -
        state.startY
      ) / scale.y;

    const maxWidth =
      Math.max(
        MIN_WIDTH,
        Math.min(
          MAX_WIDTH,
          container.offsetWidth -
            state.initialX,
        ),
      );

    const maxHeight =
      Math.max(
        MIN_HEIGHT,
        Math.min(
          MAX_HEIGHT,
          container.offsetHeight -
            state.initialY,
        ),
      );

    const startWidth =
      Math.max(
        MIN_WIDTH,
        state.initialWidth,
      );

    const startHeight =
      Math.max(
        MIN_HEIGHT,
        state.initialHeight,
      );

    /*
     * Right resize.
     */
    if (
      state.direction ===
      "right"
    ) {
      const width =
        Math.min(
          maxWidth,
          Math.max(
            MIN_WIDTH,
            startWidth +
              deltaX,
          ),
        );

      onUpdate(
        field.id,
        {
          width,
        },
      );

      return;
    }

    /*
     * Bottom resize.
     */
    if (
      state.direction ===
      "bottom"
    ) {
      const height =
        Math.min(
          maxHeight,
          Math.max(
            MIN_HEIGHT,
            startHeight +
              deltaY,
          ),
        );

      onUpdate(
        field.id,
        {
          height,
        },
      );

      return;
    }

    /*
     * Corner resize.
     *
     * Name fields do not need to
     * preserve aspect ratio, so both
     * dimensions can be adjusted
     * independently.
     */
    const width =
      Math.min(
        maxWidth,
        Math.max(
          MIN_WIDTH,
          startWidth +
            deltaX,
        ),
      );

    const height =
      Math.min(
        maxHeight,
        Math.max(
          MIN_HEIGHT,
          startHeight +
            deltaY,
        ),
      );

    onUpdate(
      field.id,
      {
        width,
        height,
      },
    );
  };

  /*
   * --------------------------------------------------
   * POINTER END
   * --------------------------------------------------
   */
  const handlePointerEnd = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    const state =
      interactionRef.current;

    if (
      !state ||
      state.pointerId !==
        event.pointerId
    ) {
      return;
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

    interactionRef.current =
      null;
  };

  /*
   * --------------------------------------------------
   * INPUT
   * --------------------------------------------------
   */
  const handleInputChange = (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    onUpdate(
      field.id,
      {
        value:
          event.target.value,
      },
    );
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
    event: ReactPointerEvent<HTMLButtonElement>,
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
        width: Math.max(
          MIN_WIDTH,
          field.width,
        ),
        height: Math.max(
          MIN_HEIGHT,
          field.height,
        ),

        /*
         * Do not disable touch scrolling
         * on the entire field.
         *
         * Only the move and resize
         * handles use touchAction: none.
         */
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
      onClick={(event) => {
        event.stopPropagation();
        onSelect(field.id);
      }}
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
            tabIndex={0}
            aria-label="Move name field"
            title="Drag to move"
            style={{
              touchAction: "none",
            }}
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();

              handleDragStart(
                event,
              );
            }}
            onKeyDown={(event) => {
              if (
                event.key ===
                  "Enter" ||
                event.key ===
                  " "
              ) {
                event.preventDefault();
                onSelect(field.id);
              }
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
            style={{
              touchAction: "none",
            }}
            onPointerDown={(
              event,
            ) =>
              handleResizeStart(
                event,
                "right",
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
            style={{
              touchAction: "none",
            }}
            onPointerDown={(
              event,
            ) =>
              handleResizeStart(
                event,
                "bottom",
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
            style={{
              touchAction: "none",
            }}
            onPointerDown={(
              event,
            ) =>
              handleResizeStart(
                event,
                "corner",
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
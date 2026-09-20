import {
  useRef,
  useState,
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import type { DocumentField } from "../../types/document";

interface DateFieldProps {
  field: DocumentField;
  selected: boolean;
  onUpdate: (
    id: string,
    updates: Partial<DocumentField>
  ) => void;
  onDelete: (id: string) => void;
  onSelect: (id: string) => void;
}

interface DragState {
  offsetX: number;
  offsetY: number;
}

interface ResizeState {
  startX: number;
  startY: number;
  startWidth: number;
  startHeight: number;
  direction: "right" | "bottom" | "corner";
}

const MIN_WIDTH = 130;
const MIN_HEIGHT = 36;

export default function DateField({
  field,
  selected,
  onUpdate,
  onDelete,
  onSelect,
}: DateFieldProps) {
  const dragState = useRef<DragState | null>(null);
  const resizeState = useRef<ResizeState | null>(null);

  const [value, setValue] = useState(
    field.value || ""
  );

  /*
   * Update date value.
   */
  const handleChange = (
    event: ChangeEvent<HTMLInputElement>
  ) => {
    const newValue = event.target.value;

    setValue(newValue);

    onUpdate(field.id, {
      value: newValue,
    });
  };

  /*
   * Select the field without starting a drag
   * when interacting with the date input.
   */
  const handleFieldClick = (
    event: React.MouseEvent<HTMLDivElement>
  ) => {
    event.stopPropagation();
    onSelect(field.id);
  };

  /*
   * Start dragging the field.
   */
  const handleDragStart = (
    event: ReactPointerEvent<HTMLDivElement>
  ) => {
    const target =
      event.target as HTMLElement;

    /*
     * Do not start dragging when interacting
     * with controls, input or resize handles.
     */
    if (
      !target.closest(".field-drag-handle") &&
      (
        target.closest(".date-controls") ||
        target.closest(".date-resize-handle") ||
        target.closest(".field-delete") ||
        target.closest("input")
      )
    ) {
      return;
    }

    event.stopPropagation();

    onSelect(field.id);

    const element =
      ((event.target as HTMLElement).closest(
        ".date-field"
      ) as HTMLDivElement | null) ??
      event.currentTarget;

    const rect =
      element.getBoundingClientRect();

    dragState.current = {
      offsetX:
        event.clientX - rect.left,
      offsetY:
        event.clientY - rect.top,
    };

    element.setPointerCapture(
      event.pointerId
    );
  };

  /*
   * Move the field.
   */
  const handleDragMove = (
    event: ReactPointerEvent<HTMLDivElement>
  ) => {
    if (!dragState.current) {
      return;
    }

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

    const newX =
      (event.clientX -
        parentRect.left -
        dragState.current.offsetX) /
      Math.max(scaleX, 0.0001);

    const newY =
      (event.clientY -
        parentRect.top -
        dragState.current.offsetY) /
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
        Math.max(0, newX)
      ),
      y: Math.min(
        maxY,
        Math.max(0, newY)
      ),
    });
  };

  /*
   * Finish dragging.
   */
  const handleDragEnd = (
    event: ReactPointerEvent<HTMLDivElement>
  ) => {
    if (!dragState.current) {
      return;
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

    dragState.current = null;
  };

  /*
   * Begin resizing.
   */
  const handleResizeStart = (
    event: ReactPointerEvent<HTMLDivElement>,
    direction: ResizeState["direction"]
  ) => {
    event.preventDefault();
    event.stopPropagation();

    onSelect(field.id);

    resizeState.current = {
      startX: event.clientX,
      startY: event.clientY,
      startWidth: field.width,
      startHeight: field.height,
      direction,
    };

    event.currentTarget.setPointerCapture(
      event.pointerId
    );
  };

  /*
   * Resize the field.
   */
  const handleResizeMove = (
    event: ReactPointerEvent<HTMLDivElement>
  ) => {
    const state =
      resizeState.current;

    if (!state) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const deltaX =
      event.clientX - state.startX;

    const deltaY =
      event.clientY - state.startY;

    const updates: Partial<DocumentField> = {};

    if (
      state.direction === "right" ||
      state.direction === "corner"
    ) {
      updates.width = Math.max(
        MIN_WIDTH,
        state.startWidth + deltaX
      );
    }

    if (
      state.direction === "bottom" ||
      state.direction === "corner"
    ) {
      updates.height = Math.max(
        MIN_HEIGHT,
        state.startHeight + deltaY
      );
    }

    onUpdate(
      field.id,
      updates
    );
  };

  /*
   * Finish resizing.
   */
  const handleResizeEnd = (
    event: ReactPointerEvent<HTMLDivElement>
  ) => {
    if (!resizeState.current) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (
      event.currentTarget.hasPointerCapture(
        event.pointerId
      )
    ) {
      event.currentTarget.releasePointerCapture(
        event.pointerId
      );
    }

    resizeState.current = null;
  };

  /*
   * Delete field.
   */
  const handleDelete = (
    event: React.MouseEvent<HTMLButtonElement>
  ) => {
    event.stopPropagation();

    onDelete(field.id);
  };

  return (
    <div
      className={`document-field date-field ${
        selected
          ? "date-field-selected"
          : ""
      }`}
      style={{
        left: field.x,
        top: field.y,
        width: field.width,
        height: field.height,
      }}
      onPointerDown={handleDragStart}
      onPointerMove={handleDragMove}
      onPointerUp={handleDragEnd}
      onPointerCancel={handleDragEnd}
      onClick={handleFieldClick}
    >
      {selected && (
        <div
          className="field-drag-handle"
            role="button"
            aria-label="Move date field"
            title="Drag to move"
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              handleDragStart(event);
            }}
        >
          ⋮⋮
        </div>
      )}

      {selected && (
        <div
          className="date-controls"
          onPointerDown={(event) =>
            event.stopPropagation()
          }
          onClick={(event) =>
            event.stopPropagation()
          }
        >

          <span className="date-control-label">
            Date
          </span>

          <button
            type="button"
            className="field-delete date-delete-button"
            onClick={handleDelete}
            aria-label="Delete date"
            title="Delete date"
          >
            ×
          </button>
        </div>
      )}

      <div className="date-field-content">
        <input
          type="date"
          value={value}
          onChange={handleChange}
          onPointerDown={(event) =>
            event.stopPropagation()
          }
          onClick={(event) =>
            event.stopPropagation()
          }
          aria-label="Date"
        />
      </div>

      {selected && (
        <>
          <div
            className="date-resize-handle date-resize-right"
            onPointerDown={(event) =>
              handleResizeStart(
                event,
                "right"
              )
            }
            onPointerMove={
              handleResizeMove
            }
            onPointerUp={
              handleResizeEnd
            }
            onPointerCancel={
              handleResizeEnd
            }
          />

          <div
            className="date-resize-handle date-resize-bottom"
            onPointerDown={(event) =>
              handleResizeStart(
                event,
                "bottom"
              )
            }
            onPointerMove={
              handleResizeMove
            }
            onPointerUp={
              handleResizeEnd
            }
            onPointerCancel={
              handleResizeEnd
            }
          />

          <div
            className="date-resize-handle date-resize-corner"
            onPointerDown={(event) =>
              handleResizeStart(
                event,
                "corner"
              )
            }
            onPointerMove={
              handleResizeMove
            }
            onPointerUp={
              handleResizeEnd
            }
            onPointerCancel={
              handleResizeEnd
            }
          />
        </>
      )}
    </div>
  );
}

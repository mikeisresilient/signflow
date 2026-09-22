import {
  useRef,
  useState,
  type ChangeEvent,
  type MouseEvent,
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

const getInteractionLayer = (
  element: HTMLElement | null
): HTMLElement | null => {
  if (!element) {
    return null;
  }

  const fieldElement =
    element.closest(
      ".date-field"
    ) as HTMLElement | null;

  if (fieldElement?.parentElement) {
    return fieldElement.parentElement;
  }

  let currentElement:
    | HTMLElement
    | null = element.parentElement;

  while (currentElement) {
    const classNameValue =
      typeof currentElement.className ===
      "string"
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

  const widthScale =
    layer.offsetWidth > 0
      ? rect.width /
        layer.offsetWidth
      : 1;

  const heightScale =
    layer.offsetHeight > 0
      ? rect.height /
        layer.offsetHeight
      : 1;

  return {
    x: Number.isFinite(widthScale) &&
      widthScale > 0
      ? widthScale
      : 1,
    y: Number.isFinite(heightScale) &&
      heightScale > 0
      ? heightScale
      : 1,
  };
};

export default function DateField({
  field,
  selected,
  onUpdate,
  onDelete,
  onSelect,
}: DateFieldProps) {
  const dragState =
    useRef<DragState | null>(null);

  const resizeState =
    useRef<ResizeState | null>(null);

  const activePointerId =
    useRef<number | null>(null);

  const [value, setValue] =
    useState(field.value || "");

  const handleChange = (
    event: ChangeEvent<HTMLInputElement>
  ) => {
    const newValue =
      event.target.value;

    setValue(newValue);

    onUpdate(field.id, {
      value: newValue,
    });
  };

  const handleFieldClick = (
    event: MouseEvent<HTMLDivElement>
  ) => {
    event.stopPropagation();
    onSelect(field.id);
  };

  const handleDragStart = (
    event: ReactPointerEvent<HTMLDivElement>
  ) => {
    const target =
      event.target instanceof HTMLElement
        ? event.target
        : null;

    const isDragHandle =
      Boolean(
        target?.closest(
          ".field-drag-handle"
        )
      );

    const isControl =
      Boolean(
        target?.closest(
          ".date-controls, .date-resize-handle, .field-delete, input, button"
        )
      );

    if (
      !isDragHandle &&
      isControl
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const fieldElement =
      (target?.closest(
        ".date-field"
      ) as HTMLDivElement | null) ??
      event.currentTarget;

    const rect =
      fieldElement.getBoundingClientRect();

    dragState.current = {
      offsetX:
        event.clientX -
        rect.left,
      offsetY:
        event.clientY -
        rect.top,
    };

    activePointerId.current =
      event.pointerId;

    onSelect(field.id);

    try {
      fieldElement.setPointerCapture(
        event.pointerId
      );
    } catch {
      // Pointer capture is not
      // available in every environment.
    }
  };

  const handleDragMove = (
    event: ReactPointerEvent<HTMLDivElement>
  ) => {
    const state =
      dragState.current;

    if (!state) {
      return;
    }

    if (
      activePointerId.current !== null &&
      event.pointerId !==
        activePointerId.current
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const fieldElement =
      (event.currentTarget.closest(
        ".date-field"
      ) as HTMLElement | null) ??
      event.currentTarget;

    const layer =
      getInteractionLayer(
        fieldElement
      );

    if (!layer) {
      return;
    }

    const layerRect =
      layer.getBoundingClientRect();

    const scale =
      getCoordinateScale(layer);

    const newX =
      (
        event.clientX -
        layerRect.left -
        state.offsetX * scale.x
      ) /
      Math.max(
        scale.x,
        0.0001
      );

    const newY =
      (
        event.clientY -
        layerRect.top -
        state.offsetY * scale.y
      ) /
      Math.max(
        scale.y,
        0.0001
      );

    const maxX =
      Math.max(
        0,
        layer.offsetWidth -
          field.width
      );

    const maxY =
      Math.max(
        0,
        layer.offsetHeight -
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

  const handleDragEnd = (
    event: ReactPointerEvent<HTMLDivElement>
  ) => {
    if (!dragState.current) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const fieldElement =
      (event.currentTarget.closest(
        ".date-field"
      ) as HTMLElement | null) ??
      event.currentTarget;

    try {
      if (
        fieldElement.hasPointerCapture(
          event.pointerId
        )
      ) {
        fieldElement.releasePointerCapture(
          event.pointerId
        );
      }
    } catch {
      // Ignore unsupported
      // pointer capture operations.
    }

    dragState.current = null;
    activePointerId.current = null;
  };

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

    activePointerId.current =
      event.pointerId;

    try {
      event.currentTarget.setPointerCapture(
        event.pointerId
      );
    } catch {
      // Ignore unsupported
      // pointer capture operations.
    }
  };

  const handleResizeMove = (
    event: ReactPointerEvent<HTMLDivElement>
  ) => {
    const state =
      resizeState.current;

    if (!state) {
      return;
    }

    if (
      activePointerId.current !== null &&
      event.pointerId !==
        activePointerId.current
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const resizeHandle =
      event.currentTarget;

    const fieldElement =
      resizeHandle.closest(
        ".date-field"
      ) as HTMLElement | null;

    const layer =
      getInteractionLayer(
        fieldElement ??
          resizeHandle
      );

    if (!layer) {
      return;
    }

    const scale =
      getCoordinateScale(layer);

    const deltaX =
      (
        event.clientX -
        state.startX
      ) /
      Math.max(
        scale.x,
        0.0001
      );

    const deltaY =
      (
        event.clientY -
        state.startY
      ) /
      Math.max(
        scale.y,
        0.0001
      );

    const updates:
      Partial<DocumentField> = {};

    if (
      state.direction ===
        "right" ||
      state.direction ===
        "corner"
    ) {
      const maxWidth =
        Math.max(
          MIN_WIDTH,
          layer.offsetWidth -
            field.x
        );

      updates.width =
        Math.min(
          maxWidth,
          Math.max(
            MIN_WIDTH,
            state.startWidth +
              deltaX
          )
        );
    }

    if (
      state.direction ===
        "bottom" ||
      state.direction ===
        "corner"
    ) {
      const maxHeight =
        Math.max(
          MIN_HEIGHT,
          layer.offsetHeight -
            field.y
        );

      updates.height =
        Math.min(
          maxHeight,
          Math.max(
            MIN_HEIGHT,
            state.startHeight +
              deltaY
          )
        );
    }

    onUpdate(
      field.id,
      updates
    );
  };

  const handleResizeEnd = (
    event: ReactPointerEvent<HTMLDivElement>
  ) => {
    if (!resizeState.current) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

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
      // Ignore unsupported
      // pointer capture operations.
    }

    resizeState.current = null;
    activePointerId.current = null;
  };

  const handleDelete = (
    event: MouseEvent<HTMLButtonElement>
  ) => {
    event.preventDefault();
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
        touchAction: "none",
        overflow: "visible",
        boxSizing: "border-box",
      }}
      onPointerDown={
        handleDragStart
      }
      onPointerMove={
        handleDragMove
      }
      onPointerUp={
        handleDragEnd
      }
      onPointerCancel={
        handleDragEnd
      }
      onClick={
        handleFieldClick
      }
    >
      {selected && (
        <div
          className="date-controls"
          onPointerDown={(
            event
          ) => {
            event.stopPropagation();
          }}
          onClick={(event) => {
            event.stopPropagation();
          }}
        >
          <div
            className="field-drag-handle"
            role="button"
            tabIndex={0}
            aria-label="Move date field"
            title="Drag to move"
            onPointerDown={(
              event
            ) => {
              handleDragStart(
                event
              );
            }}
            onClick={(event) => {
              event.stopPropagation();
            }}
          >
            ⋮⋮
          </div>

          <span className="date-control-label">
            Date
          </span>

          <button
            type="button"
            className="field-delete date-delete-button"
            onClick={
              handleDelete
            }
            aria-label="Delete date field"
            title="Delete date field"
          >
            ×
          </button>
        </div>
      )}

      <div className="date-field-content">
        <input
          type="date"
          value={value}
          onChange={
            handleChange
          }
          onPointerDown={(
            event
          ) => {
            event.stopPropagation();
          }}
          onClick={(event) => {
            event.stopPropagation();
          }}
          aria-label="Date"
        />
      </div>

      {selected && (
        <>
          <div
            className="date-resize-handle date-resize-right"
            onPointerDown={(
              event
            ) => {
              handleResizeStart(
                event,
                "right"
              );
            }}
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
            onPointerDown={(
              event
            ) => {
              handleResizeStart(
                event,
                "bottom"
              );
            }}
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
            onPointerDown={(
              event
            ) => {
              handleResizeStart(
                event,
                "corner"
              );
            }}
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
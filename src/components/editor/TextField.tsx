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

type ResizeDirection = "right" | "bottom" | "corner";

interface DragState {
  pointerId: number;
  startX: number;
  startY: number;
  initialX: number;
  initialY: number;
  offsetX: number;
  offsetY: number;
}

interface ResizeState {
  pointerId: number;
  direction: ResizeDirection;
  startX: number;
  startY: number;
  initialWidth: number;
  initialHeight: number;
}

const MIN_WIDTH = 180;
const MAX_WIDTH = 700;
const MIN_HEIGHT = 36;
const MAX_HEIGHT = 600;

const getScale = (element: HTMLElement) => {
  const parent = element.offsetParent as HTMLElement | null;

  if (!parent) {
    return { parent: null, scaleX: 1, scaleY: 1 };
  }

  const rect = parent.getBoundingClientRect();

  return {
    parent,
    scaleX:
      parent.offsetWidth > 0
        ? rect.width / parent.offsetWidth
        : 1,
    scaleY:
      parent.offsetHeight > 0
        ? rect.height / parent.offsetHeight
        : 1,
  };
};

export default function TextField({
  field,
  selected,
  onUpdate,
  onDelete,
  onSelect,
}: TextFieldProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);

  const dragRef = useRef<DragState | null>(null);
  const resizeRef = useRef<ResizeState | null>(null);

  const manuallyResizedWidth = useRef(false);
  const manuallyResizedHeight = useRef(false);

  const [editing, setEditing] = useState(true);

  const startEditing = useCallback(() => {
    setEditing(true);
    onSelect(field.id);

    window.setTimeout(() => {
      textareaRef.current?.focus();

      const textarea = textareaRef.current;
      if (!textarea) return;

      const length = textarea.value.length;
      textarea.setSelectionRange(length, length);
    }, 0);
  }, [field.id, onSelect]);

  useLayoutEffect(() => {
    if (resizeRef.current || manuallyResizedHeight.current) return;

    const measure = measureRef.current;
    if (!measure) return;

    const text = field.value || "Type here...";

    measure.style.width = `${field.width}px`;
    measure.style.whiteSpace = "pre-wrap";
    measure.textContent = text;

    const measuredHeight = Math.ceil(
      measure.getBoundingClientRect().height
    );

    const desiredHeight = Math.min(
      MAX_HEIGHT,
      Math.max(MIN_HEIGHT, measuredHeight + 10)
    );

    const newHeight = Math.max(field.height, desiredHeight);

    if (Math.abs(field.height - newHeight) > 1) {
      onUpdate(field.id, { height: newHeight });
    }
  }, [
    field.id,
    field.value,
    field.width,
    field.height,
    onUpdate,
  ]);

  useEffect(() => {
    if (resizeRef.current || manuallyResizedWidth.current) return;

    const measure = measureRef.current;
    if (!measure) return;

    const text = field.value || "Type here...";
    if (text.includes("\n")) return;

    measure.style.width = "auto";
    measure.style.whiteSpace = "pre";
    measure.textContent = text;

    const measuredWidth = Math.ceil(
      measure.getBoundingClientRect().width
    );

    const desiredWidth = Math.min(
      MAX_WIDTH,
      Math.max(MIN_WIDTH, measuredWidth + 24)
    );

    if (Math.abs(field.width - desiredWidth) > 1) {
      onUpdate(field.id, { width: desiredWidth });
    }

    measure.style.whiteSpace = "pre-wrap";
  }, [field.id, field.value, field.width, onUpdate]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!selected) return;

      if (document.activeElement === textareaRef.current) return;

      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        onDelete(field.id);
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        startEditing();
        return;
      }

      const step = event.shiftKey ? 10 : 1;

      switch (event.key) {
        case "ArrowLeft":
          event.preventDefault();
          onUpdate(field.id, {
            x: Math.max(0, field.x - step),
          });
          break;

        case "ArrowRight":
          event.preventDefault();
          onUpdate(field.id, { x: field.x + step });
          break;

        case "ArrowUp":
          event.preventDefault();
          onUpdate(field.id, {
            y: Math.max(0, field.y - step),
          });
          break;

        case "ArrowDown":
          event.preventDefault();
          onUpdate(field.id, { y: field.y + step });
          break;

        default:
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
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

  const startDrag = (
    event: React.PointerEvent<HTMLElement>
  ) => {
    event.preventDefault();
    event.stopPropagation();

    onSelect(field.id);

    const target = event.currentTarget;

    const rect = target
      .closest(".document-field")
      ?.getBoundingClientRect();

    const fieldElement = target.closest(
      ".document-field"
    ) as HTMLElement | null;

    if (!rect || !fieldElement) return;

    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      initialX: field.x,
      initialY: field.y,
      offsetX:
        (event.clientX - rect.left) /
        Math.max(
          getScale(fieldElement).scaleX,
          0.0001
        ),
      offsetY:
        (event.clientY - rect.top) /
        Math.max(
          getScale(fieldElement).scaleY,
          0.0001
        ),
    };

    target.setPointerCapture(event.pointerId);
  };

  const moveDrag = (
    event: React.PointerEvent<HTMLElement>
  ) => {
    const state = dragRef.current;
    if (!state || state.pointerId !== event.pointerId) return;

    event.preventDefault();
    event.stopPropagation();

    const fieldElement = (
      event.currentTarget.closest(
        ".document-field"
      ) as HTMLElement | null
    );

    if (!fieldElement) return;

    const { parent, scaleX, scaleY } = getScale(fieldElement);
    if (!parent) return;

    const parentRect = parent.getBoundingClientRect();

    const pointerX =
      (event.clientX - parentRect.left) /
      Math.max(scaleX, 0.0001);

    const pointerY =
      (event.clientY - parentRect.top) /
      Math.max(scaleY, 0.0001);

    const maxX = Math.max(
      0,
      parent.offsetWidth - field.width
    );
    const maxY = Math.max(
      0,
      parent.offsetHeight - field.height
    );

    onUpdate(field.id, {
      x: Math.min(
        maxX,
        Math.max(0, pointerX - state.offsetX)
      ),
      y: Math.min(
        maxY,
        Math.max(0, pointerY - state.offsetY)
      ),
    });
  };

  const endDrag = (
    event: React.PointerEvent<HTMLElement>
  ) => {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
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

  const startResize = (
    event: React.PointerEvent<HTMLElement>,
    direction: ResizeDirection
  ) => {
    event.preventDefault();
    event.stopPropagation();

    onSelect(field.id);

    resizeRef.current = {
      pointerId: event.pointerId,
      direction,
      startX: event.clientX,
      startY: event.clientY,
      initialWidth: field.width,
      initialHeight: field.height,
    };

    if (
      direction === "right" ||
      direction === "corner"
    ) {
      manuallyResizedWidth.current = true;
    }

    if (
      direction === "bottom" ||
      direction === "corner"
    ) {
      manuallyResizedHeight.current = true;
    }

    event.currentTarget.setPointerCapture(
      event.pointerId
    );
  };

  const moveResize = (
    event: React.PointerEvent<HTMLElement>
  ) => {
    const state = resizeRef.current;
    if (!state || state.pointerId !== event.pointerId) return;

    event.preventDefault();
    event.stopPropagation();

    const fieldElement = (
      event.currentTarget.closest(
        ".document-field"
      ) as HTMLElement | null
    );

    if (!fieldElement) return;

    const { parent, scaleX, scaleY } = getScale(fieldElement);
    if (!parent) return;

    const deltaX =
      (event.clientX - state.startX) /
      Math.max(scaleX, 0.0001);

    const deltaY =
      (event.clientY - state.startY) /
      Math.max(scaleY, 0.0001);

    let width = state.initialWidth;
    let height = state.initialHeight;

    if (
      state.direction === "right" ||
      state.direction === "corner"
    ) {
      width = Math.min(
        MAX_WIDTH,
        Math.max(
          MIN_WIDTH,
          Math.min(
            state.initialWidth + deltaX,
            parent.offsetWidth - field.x
          )
        )
      );
    }

    if (
      state.direction === "bottom" ||
      state.direction === "corner"
    ) {
      height = Math.min(
        MAX_HEIGHT,
        Math.max(
          MIN_HEIGHT,
          Math.min(
            state.initialHeight + deltaY,
            parent.offsetHeight - field.y
          )
        )
      );
    }

    onUpdate(field.id, { width, height });
  };

  const endResize = (
    event: React.PointerEvent<HTMLElement>
  ) => {
    if (
      resizeRef.current?.pointerId === event.pointerId
    ) {
      resizeRef.current = null;
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

  const handleChange = (
    event: React.ChangeEvent<HTMLTextAreaElement>
  ) => {
    onUpdate(field.id, {
      value: event.target.value,
    });
  };

  const handleTextareaKeyDown = (
    event: React.KeyboardEvent<HTMLTextAreaElement>
  ) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setEditing(false);
      textareaRef.current?.blur();
    }
  };

  return (
    <>
      <div
        ref={measureRef}
        className="text-measure"
        aria-hidden="true"
      />

      <div
        className={`document-field text-field ${
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
          touchAction: "none",
        }}
        onPointerDown={(event) => {
          const target = event.target as HTMLElement;

          if (
            target.closest(
              ".field-resize-handle, .field-delete, .field-drag-handle"
            )
          ) {
            return;
          }

          if (
            target === textareaRef.current ||
            textareaRef.current?.contains(
              target as Node
            )
          ) {
            onSelect(field.id);
            return;
          }

          startDrag(event);
        }}
        onClick={(event) => {
          event.stopPropagation();
          onSelect(field.id);
        }}
      >
        {selected && (
          <div
            className="field-drag-handle text-drag-handle"
            role="button"
            tabIndex={0}
            aria-label="Move text field"
            title="Drag to move"
            onPointerDown={startDrag}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            <span aria-hidden="true">⋮⋮</span>
            <span>MOVE</span>
          </div>
        )}

        <textarea
          ref={textareaRef}
          value={field.value}
          placeholder="Type here..."
          autoFocus={editing}
          spellCheck
          rows={1}
          onChange={handleChange}
          onKeyDown={handleTextareaKeyDown}
          onFocus={() => {
            setEditing(true);
            onSelect(field.id);
          }}
          onBlur={() => setEditing(false)}
          onPointerDown={(event) => {
            event.stopPropagation();
            onSelect(field.id);
          }}
          onClick={(event) => event.stopPropagation()}
        />

        {selected && (
          <>
            <div
              className="field-resize-handle field-resize-right"
              role="presentation"
              aria-label="Resize text field horizontally"
              onPointerDown={(event) =>
                startResize(event, "right")
              }
              onPointerMove={moveResize}
              onPointerUp={endResize}
              onPointerCancel={endResize}
            />

            <div
              className="field-resize-handle field-resize-bottom"
              role="presentation"
              aria-label="Resize text field vertically"
              onPointerDown={(event) =>
                startResize(event, "bottom")
              }
              onPointerMove={moveResize}
              onPointerUp={endResize}
              onPointerCancel={endResize}
            />

            <div
              className="field-resize-handle field-resize-corner"
              role="presentation"
              aria-label="Resize text field"
              onPointerDown={(event) =>
                startResize(event, "corner")
              }
              onPointerMove={moveResize}
              onPointerUp={endResize}
              onPointerCancel={endResize}
            />

            <button
              type="button"
              className="field-delete"
              aria-label="Delete text field"
              title="Delete field"
              onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onDelete(field.id);
              }}
              onClick={(event) =>
                event.stopPropagation()
              }
            >
              ×
            </button>
          </>
        )}
      </div>
    </>
  );
}

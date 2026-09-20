import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import type { DocumentField } from "../../types/document";

type SignatureMode = "draw" | "type" | "upload";
type ResizeDirection = "right" | "bottom" | "corner";

interface SignatureFieldProps {
  field: DocumentField;
  selected: boolean;
  onUpdate: (
    id: string,
    updates: Partial<DocumentField>,
  ) => void;
  onDelete: (id: string) => void;
  onSelect: (id: string) => void;
}

interface DragState {
  pointerId: number;
  offsetX: number;
  offsetY: number;
}

interface ResizeState {
  pointerId: number;
  startX: number;
  startY: number;
  startWidth: number;
  startHeight: number;
  direction: ResizeDirection;
}

const MIN_WIDTH = 120;
const MIN_HEIGHT = 60;
const MAX_WIDTH = 700;
const MAX_HEIGHT = 500;

const DEFAULT_SIGNATURE_FONT =
  '"Brush Script MT", "Segoe Script", cursive';

const getParentMetrics = (element: HTMLElement) => {
  const parent = element.offsetParent as HTMLElement | null;

  if (!parent) {
    return {
      parent: null,
      scaleX: 1,
      scaleY: 1,
    };
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

export default function SignatureField({
  field,
  selected,
  onUpdate,
  onDelete,
  onSelect,
}: SignatureFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const resizeRef = useRef<ResizeState | null>(null);

  const [isDrawing, setIsDrawing] = useState(false);

  const mode: SignatureMode =
    field.signatureMode || "draw";

  const hasDrawing = Boolean(field.signatureImage);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas || mode !== "draw") return;

    const context = canvas.getContext("2d");
    if (!context) return;

    context.clearRect(
      0,
      0,
      canvas.width,
      canvas.height,
    );

    context.lineWidth = 3;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = "#181818";

    if (!field.signatureImage) return;

    const image = new Image();

    image.onload = () => {
      context.clearRect(
        0,
        0,
        canvas.width,
        canvas.height,
      );

      context.drawImage(
        image,
        0,
        0,
        canvas.width,
        canvas.height,
      );
    };

    image.src = field.signatureImage;

    return () => {
      image.onload = null;
    };
  }, [mode, field.signatureImage]);

  const getCanvasPoint = (
    event: ReactPointerEvent<HTMLCanvasElement>,
  ) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();

    return {
      x:
        (event.clientX - rect.left) *
        (canvas.width / Math.max(rect.width, 1)),
      y:
        (event.clientY - rect.top) *
        (canvas.height / Math.max(rect.height, 1)),
    };
  };

  const handleDrawStart = (
    event: ReactPointerEvent<HTMLCanvasElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();

    if (mode !== "draw") return;

    onSelect(field.id);

    const point = getCanvasPoint(event);
    const canvas = canvasRef.current;
    if (!point || !canvas) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    canvas.setPointerCapture(event.pointerId);

    context.lineWidth = 3;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = "#181818";

    context.beginPath();
    context.moveTo(point.x, point.y);

    setIsDrawing(true);
  };

  const handleDrawMove = (
    event: ReactPointerEvent<HTMLCanvasElement>,
  ) => {
    if (!isDrawing || mode !== "draw") return;

    event.preventDefault();
    event.stopPropagation();

    const point = getCanvasPoint(event);
    const canvas = canvasRef.current;
    if (!point || !canvas) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    context.lineTo(point.x, point.y);
    context.stroke();
  };

  const finishDrawing = (
    event?: ReactPointerEvent<HTMLCanvasElement>,
  ) => {
    if (!isDrawing) return;

    const canvas = canvasRef.current;

    if (
      event &&
      canvas?.hasPointerCapture(event.pointerId)
    ) {
      canvas.releasePointerCapture(event.pointerId);
    }

    setIsDrawing(false);

    if (!canvas) return;

    const image = canvas.toDataURL("image/png");

    onUpdate(field.id, {
      value: image,
      signatureImage: image,
    });
  };

  const handleClearDrawing = (
    event: React.MouseEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();

    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    context.clearRect(
      0,
      0,
      canvas.width,
      canvas.height,
    );

    onUpdate(field.id, {
      value: "",
      signatureImage: "",
    });

    onSelect(field.id);
  };

  const handleModeChange = (
    nextMode: SignatureMode,
    event: React.MouseEvent,
  ) => {
    event.preventDefault();
    event.stopPropagation();

    onSelect(field.id);

    onUpdate(field.id, {
      signatureMode: nextMode,
    });
  };

  const handleTypedChange = (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    onUpdate(field.id, {
      value: event.target.value,
      signatureImage: "",
    });
  };

  const handleUpload = (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];

    if (!file || !file.type.startsWith("image/")) {
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result !== "string") return;

      onUpdate(field.id, {
        value: reader.result,
        signatureImage: reader.result,
      });

      onSelect(field.id);
    };

    reader.readAsDataURL(file);
    event.target.value = "";
  };

  const startDrag = (
    event: ReactPointerEvent<HTMLElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();

    onSelect(field.id);

    const fieldElement =
      event.currentTarget.closest(
        ".signature-field",
      ) as HTMLElement | null;

    if (!fieldElement) return;

    const rect = fieldElement.getBoundingClientRect();
    const { scaleX, scaleY } =
      getParentMetrics(fieldElement);

    dragRef.current = {
      pointerId: event.pointerId,
      offsetX:
        (event.clientX - rect.left) /
        Math.max(scaleX, 0.0001),
      offsetY:
        (event.clientY - rect.top) /
        Math.max(scaleY, 0.0001),
    };

    event.currentTarget.setPointerCapture(
      event.pointerId,
    );
  };

  const moveDrag = (
    event: ReactPointerEvent<HTMLElement>,
  ) => {
    const state = dragRef.current;

    if (
      !state ||
      state.pointerId !== event.pointerId
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const fieldElement =
      event.currentTarget.closest(
        ".signature-field",
      ) as HTMLElement | null;

    if (!fieldElement) return;

    const { parent, scaleX, scaleY } =
      getParentMetrics(fieldElement);

    if (!parent) return;

    const parentRect =
      parent.getBoundingClientRect();

    const pointerX =
      (event.clientX - parentRect.left) /
      Math.max(scaleX, 0.0001);

    const pointerY =
      (event.clientY - parentRect.top) /
      Math.max(scaleY, 0.0001);

    const width = Math.max(
      MIN_WIDTH,
      field.width,
    );

    const height = Math.max(
      MIN_HEIGHT,
      field.height,
    );

    const maxX = Math.max(
      0,
      parent.offsetWidth - width,
    );

    const maxY = Math.max(
      0,
      parent.offsetHeight - height,
    );

    onUpdate(field.id, {
      x: Math.min(
        maxX,
        Math.max(
          0,
          pointerX - state.offsetX,
        ),
      ),
      y: Math.min(
        maxY,
        Math.max(
          0,
          pointerY - state.offsetY,
        ),
      ),
    });
  };

  const endDrag = (
    event: ReactPointerEvent<HTMLElement>,
  ) => {
    if (
      dragRef.current?.pointerId ===
      event.pointerId
    ) {
      dragRef.current = null;
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
  };

  const startResize = (
    event: ReactPointerEvent<HTMLElement>,
    direction: ResizeDirection,
  ) => {
    event.preventDefault();
    event.stopPropagation();

    onSelect(field.id);

    resizeRef.current = {
      pointerId: event.pointerId,
      direction,
      startX: event.clientX,
      startY: event.clientY,
      startWidth: Math.max(
        MIN_WIDTH,
        field.width,
      ),
      startHeight: Math.max(
        MIN_HEIGHT,
        field.height,
      ),
    };

    event.currentTarget.setPointerCapture(
      event.pointerId,
    );
  };

  const moveResize = (
    event: ReactPointerEvent<HTMLElement>,
  ) => {
    const state = resizeRef.current;

    if (
      !state ||
      state.pointerId !== event.pointerId
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const fieldElement =
      event.currentTarget.closest(
        ".signature-field",
      ) as HTMLElement | null;

    if (!fieldElement) return;

    const { parent, scaleX, scaleY } =
      getParentMetrics(fieldElement);

    if (!parent) return;

    const deltaX =
      (event.clientX - state.startX) /
      Math.max(scaleX, 0.0001);

    const deltaY =
      (event.clientY - state.startY) /
      Math.max(scaleY, 0.0001);

    const maxWidth = Math.max(
      MIN_WIDTH,
      Math.min(
        MAX_WIDTH,
        parent.offsetWidth - field.x,
      ),
    );

    const maxHeight = Math.max(
      MIN_HEIGHT,
      Math.min(
        MAX_HEIGHT,
        parent.offsetHeight - field.y,
      ),
    );

    if (state.direction === "right") {
      onUpdate(field.id, {
        width: Math.min(
          maxWidth,
          Math.max(
            MIN_WIDTH,
            state.startWidth + deltaX,
          ),
        ),
      });
      return;
    }

    if (state.direction === "bottom") {
      onUpdate(field.id, {
        height: Math.min(
          maxHeight,
          Math.max(
            MIN_HEIGHT,
            state.startHeight + deltaY,
          ),
        ),
      });
      return;
    }

    const ratio =
      state.startWidth /
      Math.max(state.startHeight, 1);

    const widthFromX = Math.min(
      maxWidth,
      Math.max(
        MIN_WIDTH,
        state.startWidth + deltaX,
      ),
    );

    const heightFromX = Math.min(
      maxHeight,
      Math.max(
        MIN_HEIGHT,
        widthFromX / ratio,
      ),
    );

    const heightFromY = Math.min(
      maxHeight,
      Math.max(
        MIN_HEIGHT,
        state.startHeight + deltaY,
      ),
    );

    const widthFromY = Math.min(
      maxWidth,
      Math.max(
        MIN_WIDTH,
        heightFromY * ratio,
      ),
    );

    if (Math.abs(deltaX) >= Math.abs(deltaY)) {
      onUpdate(field.id, {
        width: widthFromX,
        height: heightFromX,
      });
    } else {
      onUpdate(field.id, {
        width: widthFromY,
        height: heightFromY,
      });
    }
  };

  const endResize = (
    event: ReactPointerEvent<HTMLElement>,
  ) => {
    if (
      resizeRef.current?.pointerId ===
      event.pointerId
    ) {
      resizeRef.current = null;
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
  };

  const typedValue = field.value || "";

  const typedFontSize =
    typedValue.length > 0
      ? Math.max(
          10,
          Math.min(
            42,
            field.height * 0.58,
            field.width /
              Math.max(
                1,
                typedValue.length * 0.62,
              ),
          ),
        )
      : Math.max(
          12,
          Math.min(
            32,
            field.height * 0.58,
          ),
        );

  const displayImage =
    field.signatureImage ||
    field.value;

  return (
    <div
      className={`document-field signature-field ${
        selected
          ? "signature-field-selected"
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
        minWidth: MIN_WIDTH,
        minHeight: MIN_HEIGHT,
        touchAction: "none",
      }}
      onPointerDown={(event) => {
        const target =
          event.target as HTMLElement;

        if (
          target.closest(
            ".signature-controls, .signature-resize-handle, .field-drag-handle, .field-delete, canvas, input, label, button",
          )
        ) {
          return;
        }

        startDrag(event);
      }}
      onPointerMove={moveDrag}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(field.id);
      }}
    >
      {selected && (
        <div
          className="field-drag-handle signature-drag-handle"
          role="button"
          tabIndex={0}
          aria-label="Move signature field"
          title="Drag to move signature"
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <span aria-hidden="true">⋮⋮</span>
          <span>MOVE</span>
        </div>
      )}

      {selected && (
        <div
          className="signature-controls"
          onPointerDown={(event) =>
            event.stopPropagation()
          }
          onClick={(event) =>
            event.stopPropagation()
          }
        >
          <button
            type="button"
            className={
              mode === "draw"
                ? "signature-mode-active"
                : ""
            }
            onClick={(event) =>
              handleModeChange(
                "draw",
                event,
              )
            }
          >
            Draw
          </button>

          <button
            type="button"
            className={
              mode === "type"
                ? "signature-mode-active"
                : ""
            }
            onClick={(event) =>
              handleModeChange(
                "type",
                event,
              )
            }
          >
            Type
          </button>

          <label
            className={
              mode === "upload"
                ? "signature-mode-active"
                : ""
            }
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            Upload
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleUpload}
            />
          </label>

          <button
            type="button"
            className="field-delete signature-delete-button"
            aria-label="Delete signature field"
            title="Delete signature field"
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
        </div>
      )}

      {mode === "draw" && (
        <div className="signature-draw-area">
          <canvas
            ref={canvasRef}
            className="signature-canvas"
            width={700}
            height={260}
            onPointerDown={handleDrawStart}
            onPointerMove={handleDrawMove}
            onPointerUp={finishDrawing}
            onPointerCancel={finishDrawing}
          />

          {!hasDrawing && (
            <div className="signature-placeholder">
              Draw your signature here
            </div>
          )}

          {selected && hasDrawing && (
            <button
              type="button"
              className="signature-clear"
              onPointerDown={(event) =>
                event.stopPropagation()
              }
              onClick={handleClearDrawing}
            >
              Clear
            </button>
          )}
        </div>
      )}

      {mode === "type" && (
        <div className="signature-type-area">
          <input
            type="text"
            value={typedValue}
            placeholder="Type your signature"
            onChange={handleTypedChange}
            onPointerDown={(event) =>
              event.stopPropagation()
            }
            style={{
              fontFamily:
                field.signatureFont ||
                DEFAULT_SIGNATURE_FONT,
              fontSize: `${typedFontSize}px`,
            }}
            aria-label="Type signature"
          />
        </div>
      )}

      {mode === "upload" && (
        <div className="signature-upload-area">
          {displayImage ? (
            <img
              src={displayImage}
              alt="Uploaded signature"
              className="signature-image"
              draggable={false}
            />
          ) : (
            <label
              className="signature-upload-label"
              onPointerDown={(event) =>
                event.stopPropagation()
              }
            >
              <span>Choose signature image</span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleUpload}
              />
            </label>
          )}
        </div>
      )}

      {selected && (
        <>
          <div
            className="signature-resize-handle signature-resize-right"
            role="presentation"
            aria-label="Resize signature width"
            onPointerDown={(event) =>
              startResize(event, "right")
            }
            onPointerMove={moveResize}
            onPointerUp={endResize}
            onPointerCancel={endResize}
          />

          <div
            className="signature-resize-handle signature-resize-bottom"
            role="presentation"
            aria-label="Resize signature height"
            onPointerDown={(event) =>
              startResize(event, "bottom")
            }
            onPointerMove={moveResize}
            onPointerUp={endResize}
            onPointerCancel={endResize}
          />

          <div
            className="signature-resize-handle signature-resize-corner"
            role="presentation"
            aria-label="Resize signature proportionally"
            onPointerDown={(event) =>
              startResize(event, "corner")
            }
            onPointerMove={moveResize}
            onPointerUp={endResize}
            onPointerCancel={endResize}
          />
        </>
      )}
    </div>
  );
}

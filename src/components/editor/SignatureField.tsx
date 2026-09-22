import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import type { DocumentField } from "../../types/document";

type SignatureMode =
  | "draw"
  | "type"
  | "upload";

type ResizeDirection =
  | "right"
  | "bottom"
  | "corner";

interface SignatureFieldProps {
  field: DocumentField;
  selected: boolean;
  onUpdate: (
    id: string,
    updates: Partial<DocumentField>,
  ) => void;
  onDelete: (
    id: string,
  ) => void;
  onSelect: (
    id: string,
  ) => void;
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

const CANVAS_WIDTH = 700;
const CANVAS_HEIGHT = 260;

const DEFAULT_SIGNATURE_FONT =
  '"Brush Script MT", "Segoe Script", cursive';

function getInteractionContainer(
  element: HTMLElement,
): HTMLElement | null {
  const fieldElement =
    element.closest(
      ".signature-field",
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

    if (
      classNameValue
        .split(/\s+/)
        .some(
          (className) =>
            className ===
              "field-layer" ||
            className ===
              "docx-field-layer" ||
            className ===
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

function getScale(
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

export default function SignatureField({
  field,
  selected,
  onUpdate,
  onDelete,
  onSelect,
}: SignatureFieldProps) {
  const canvasRef =
    useRef<HTMLCanvasElement | null>(
      null,
    );

  const dragState =
    useRef<DragState | null>(null);

  const resizeState =
    useRef<ResizeState | null>(null);

  const [isDrawing, setIsDrawing] =
    useState(false);

  const mode: SignatureMode =
    field.signatureMode || "draw";

  const hasDrawing =
    Boolean(field.signatureImage);

  /*
   * Keep the drawing canvas synchronized
   * with the stored signature image.
   */
  useEffect(() => {
    const canvas =
      canvasRef.current;

    if (
      !canvas ||
      mode !== "draw"
    ) {
      return;
    }

    const context =
      canvas.getContext("2d");

    if (!context) {
      return;
    }

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

    if (!field.signatureImage) {
      return;
    }

    const image =
      new Image();

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

    image.src =
      field.signatureImage;

    return () => {
      image.onload = null;
    };
  }, [
    mode,
    field.signatureImage,
  ]);

  /*
   * Start drawing a signature.
   */
  const handlePointerDown = (
    event: ReactPointerEvent<HTMLCanvasElement>,
  ) => {
    event.stopPropagation();

    if (mode !== "draw") {
      return;
    }

    const canvas =
      canvasRef.current;

    if (!canvas) {
      return;
    }

    const rect =
      canvas.getBoundingClientRect();

    if (
      rect.width <= 0 ||
      rect.height <= 0
    ) {
      return;
    }

    canvas.setPointerCapture(
      event.pointerId,
    );

    const scaleX =
      canvas.width /
      rect.width;

    const scaleY =
      canvas.height /
      rect.height;

    const x =
      (event.clientX -
        rect.left) *
      scaleX;

    const y =
      (event.clientY -
        rect.top) *
      scaleY;

    const context =
      canvas.getContext("2d");

    if (!context) {
      return;
    }

    context.lineWidth = 3;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle =
      "#181818";

    context.beginPath();
    context.moveTo(x, y);

    setIsDrawing(true);
  };

  /*
   * Continue drawing.
   */
  const handlePointerMove = (
    event: ReactPointerEvent<HTMLCanvasElement>,
  ) => {
    if (
      !isDrawing ||
      mode !== "draw"
    ) {
      return;
    }

    const canvas =
      canvasRef.current;

    if (!canvas) {
      return;
    }

    const rect =
      canvas.getBoundingClientRect();

    if (
      rect.width <= 0 ||
      rect.height <= 0
    ) {
      return;
    }

    const scaleX =
      canvas.width /
      rect.width;

    const scaleY =
      canvas.height /
      rect.height;

    const x =
      (event.clientX -
        rect.left) *
      scaleX;

    const y =
      (event.clientY -
        rect.top) *
      scaleY;

    const context =
      canvas.getContext("2d");

    if (!context) {
      return;
    }

    context.lineTo(x, y);
    context.stroke();
  };

  /*
   * Finish drawing.
   */
  const finishDrawing = (
    event?: ReactPointerEvent<HTMLCanvasElement>,
  ) => {
    if (!isDrawing) {
      return;
    }

    const canvas =
      canvasRef.current;

    if (
      event &&
      canvas?.hasPointerCapture(
        event.pointerId,
      )
    ) {
      canvas.releasePointerCapture(
        event.pointerId,
      );
    }

    setIsDrawing(false);

    if (!canvas) {
      return;
    }

    const image =
      canvas.toDataURL(
        "image/png",
      );

    onUpdate(
      field.id,
      {
        value: image,
        signatureImage: image,
      },
    );
  };

  /*
   * Clear drawn signature.
   */
  const handleClearDrawing = (
    event: ReactMouseEvent<HTMLButtonElement>,
  ) => {
    event.stopPropagation();

    const canvas =
      canvasRef.current;

    if (!canvas) {
      return;
    }

    const context =
      canvas.getContext("2d");

    if (!context) {
      return;
    }

    context.clearRect(
      0,
      0,
      canvas.width,
      canvas.height,
    );

    onUpdate(
      field.id,
      {
        value: "",
        signatureImage: "",
      },
    );
  };

  /*
   * Change signature mode.
   */
  const handleModeChange = (
    nextMode: SignatureMode,
    event: ReactMouseEvent,
  ) => {
    event.stopPropagation();

    onSelect(field.id);

    onUpdate(
      field.id,
      {
        signatureMode:
          nextMode,
      },
    );
  };

  /*
   * Update typed signature.
   */
  const handleTypedChange = (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    onUpdate(
      field.id,
      {
        value:
          event.target.value,
        signatureImage: "",
      },
    );
  };

  /*
   * Upload signature image.
   */
  const handleUpload = (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file =
      event.target.files?.[0];

    if (!file) {
      return;
    }

    if (
      !file.type.startsWith(
        "image/",
      )
    ) {
      event.target.value = "";
      return;
    }

    const reader =
      new FileReader();

    reader.onload = () => {
      const result =
        reader.result;

      if (
        typeof result !==
        "string"
      ) {
        return;
      }

      onUpdate(
        field.id,
        {
          value: result,
          signatureImage:
            result,
        },
      );
    };

    reader.readAsDataURL(file);

    event.target.value = "";
  };

  /*
   * Start moving the field.
   *
   * Only the visible move handle
   * starts a drag. This prevents
   * inputs, buttons and drawing
   * surfaces from accidentally
   * moving the field.
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

    const element =
      event.currentTarget;

    const rect =
      element.getBoundingClientRect();

    dragState.current = {
      pointerId:
        event.pointerId,
      offsetX:
        event.clientX -
        rect.left,
      offsetY:
        event.clientY -
        rect.top,
    };

    element.setPointerCapture(
      event.pointerId,
    );
  };

  /*
   * Move the field.
   */
  const handleDragMove = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    const state =
      dragState.current;

    if (!state) {
      return;
    }

    if (
      event.pointerId !==
      state.pointerId
    ) {
      return;
    }

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
      getScale(container);

    const rawX =
      (
        event.clientX -
        containerRect.left -
        state.offsetX
      ) / scale.x;

    const rawY =
      (
        event.clientY -
        containerRect.top -
        state.offsetY
      ) / scale.y;

    const fieldWidth =
      Math.max(
        MIN_WIDTH,
        field.width,
      );

    const fieldHeight =
      Math.max(
        MIN_HEIGHT,
        field.height,
      );

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

    const x =
      Math.min(
        maxX,
        Math.max(0, rawX),
      );

    const y =
      Math.min(
        maxY,
        Math.max(0, rawY),
      );

    onUpdate(
      field.id,
      {
        x,
        y,
      },
    );
  };

  /*
   * Finish moving the field.
   */
  const handleDragEnd = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    const state =
      dragState.current;

    if (!state) {
      return;
    }

    if (
      event.pointerId !==
      state.pointerId
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

    dragState.current = null;
  };

  /*
   * Begin resizing.
   */
  const handleResizeStart = (
    event: ReactPointerEvent<HTMLDivElement>,
    direction: ResizeDirection,
  ) => {
    event.preventDefault();
    event.stopPropagation();

    onSelect(field.id);

    resizeState.current = {
      pointerId:
        event.pointerId,
      startX:
        event.clientX,
      startY:
        event.clientY,
      startWidth:
        Math.max(
          MIN_WIDTH,
          field.width,
        ),
      startHeight:
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
   * Resize the field.
   */
  const handleResizeMove = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    const state =
      resizeState.current;

    if (!state) {
      return;
    }

    if (
      event.pointerId !==
      state.pointerId
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const container =
      getInteractionContainer(
        event.currentTarget,
      );

    if (!container) {
      return;
    }

    const scale =
      getScale(container);

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
        container.offsetWidth -
          field.x,
      );

    const maxHeight =
      Math.max(
        MIN_HEIGHT,
        container.offsetHeight -
          field.y,
      );

    const startWidth =
      Math.max(
        MIN_WIDTH,
        state.startWidth,
      );

    const startHeight =
      Math.max(
        MIN_HEIGHT,
        state.startHeight,
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
          MAX_WIDTH,
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
          MAX_HEIGHT,
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
     * The corner always preserves
     * the original aspect ratio.
     */
    const safeStartWidth =
      Math.max(
        startWidth,
        0.0001,
      );

    const safeStartHeight =
      Math.max(
        startHeight,
        0.0001,
      );

    const widthScale =
      (
        startWidth +
        deltaX
      ) /
      safeStartWidth;

    const heightScale =
      (
        startHeight +
        deltaY
      ) /
      safeStartHeight;

    const requestedScale =
      Math.abs(deltaX) >=
      Math.abs(deltaY)
        ? widthScale
        : heightScale;

    const minimumScale =
      Math.max(
        MIN_WIDTH /
          safeStartWidth,
        MIN_HEIGHT /
          safeStartHeight,
      );

    const maximumScale =
      Math.min(
        MAX_WIDTH /
          safeStartWidth,
        MAX_HEIGHT /
          safeStartHeight,
        maxWidth /
          safeStartWidth,
        maxHeight /
          safeStartHeight,
      );

    const safeMaximumScale =
      Math.max(
        minimumScale,
        maximumScale,
      );

    const finalScale =
      Math.min(
        safeMaximumScale,
        Math.max(
          minimumScale,
          requestedScale,
        ),
      );

    const width =
      Math.min(
        MAX_WIDTH,
        maxWidth,
        Math.max(
          MIN_WIDTH,
          startWidth *
            finalScale,
        ),
      );

    const height =
      Math.min(
        MAX_HEIGHT,
        maxHeight,
        Math.max(
          MIN_HEIGHT,
          startHeight *
            finalScale,
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
   * Finish resizing.
   */
  const handleResizeEnd = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    const state =
      resizeState.current;

    if (!state) {
      return;
    }

    if (
      event.pointerId !==
      state.pointerId
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

    resizeState.current = null;
  };

  /*
   * Delete the signature field.
   */
  const handleDelete = (
    event: ReactMouseEvent<HTMLButtonElement>,
  ) => {
    event.stopPropagation();

    onDelete(field.id);
  };

  /*
   * Typed signature sizing.
   */
  const typedValue =
    field.value || "";

  const typedFontSize =
    typedValue.length > 0
      ? Math.max(
          10,
          Math.min(
            42,
            field.height *
              0.58,
            field.width /
              Math.max(
                1,
                typedValue.length *
                  0.62,
              ),
          ),
        )
      : Math.max(
          12,
          Math.min(
            32,
            field.height *
              0.58,
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
      onClick={(event) => {
        event.stopPropagation();
        onSelect(field.id);
      }}
    >
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
          <div
            className="field-drag-handle"
            role="button"
            tabIndex={0}
            aria-label="Move signature field"
            title="Drag to move"
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              handleDragStart(event);
            }}
            onKeyDown={(event) => {
              if (
                event.key ===
                "Enter"
              ) {
                onSelect(field.id);
              }
            }}
          >
            ⋮⋮
          </div>

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
              onChange={
                handleUpload
              }
            />
          </label>


        </div>
      )}

      {selected && (
        <button
          type="button"
          className="field-delete signature-delete-button"
          onClick={handleDelete}
          aria-label="Delete signature"
          title="Delete signature"
        >
          ×
        </button>
      )}

      {mode === "draw" && (
        <div className="signature-draw-area">
          <canvas
            ref={canvasRef}
            className="signature-canvas"
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            style={{
              touchAction: "none",
            }}
            onPointerDown={
              handlePointerDown
            }
            onPointerMove={
              handlePointerMove
            }
            onPointerUp={
              finishDrawing
            }
            onPointerCancel={
              finishDrawing
            }
          />

          {!hasDrawing && (
            <div className="signature-placeholder">
              Draw your signature here
            </div>
          )}

          {selected &&
            hasDrawing && (
              <button
                type="button"
                className="signature-clear"
                onPointerDown={(
                  event,
                ) =>
                  event.stopPropagation()
                }
                onClick={
                  handleClearDrawing
                }
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
            placeholder=""
            onChange={
              handleTypedChange
            }
            onPointerDown={(
              event,
            ) =>
              event.stopPropagation()
            }
            style={{
              fontFamily:
                field.signatureFont ||
                DEFAULT_SIGNATURE_FONT,
              fontSize:
                `${typedFontSize}px`,
            }}
            aria-label="Type signature"
          />

          {!typedValue && (
            <span
              className="signature-type-placeholder"
              aria-hidden="true"
            >
              Type your signature
            </span>
          )}
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
              onPointerDown={(
                event,
              ) =>
                event.stopPropagation()
              }
            >
              <span>
                Choose signature image
              </span>

              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={
                  handleUpload
                }
              />
            </label>
          )}
        </div>
      )}

      {selected && (
        <>
          <div
            className="signature-resize-handle signature-resize-right"
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
            className="signature-resize-handle signature-resize-bottom"
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
            className="signature-resize-handle signature-resize-corner"
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
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import type { DocumentField } from "../../types/document";

type SignatureMode =
  | "draw"
  | "type"
  | "upload";

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
  offsetX: number;
  offsetY: number;
}

interface ResizeState {
  startX: number;
  startY: number;
  startWidth: number;
  startHeight: number;
  direction:
    | "right"
    | "bottom"
    | "corner";
}

const MIN_WIDTH = 120;
const MIN_HEIGHT = 60;

const DEFAULT_SIGNATURE_FONT =
  '"Brush Script MT", "Segoe Script", cursive';

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
    useRef<DragState | null>(
      null,
    );

  const resizeState =
    useRef<ResizeState | null>(
      null,
    );

  const [isDrawing, setIsDrawing] =
    useState(false);

  /*
   * This is derived directly from
   * the document field instead of being
   * duplicated in React state.
   */
  const hasDrawing =
    Boolean(
      field.signatureImage,
    );

  /*
   * Signature mode comes directly
   * from the document field.
   */
  const mode: SignatureMode =
    field.signatureMode ||
    "draw";

  /*
   * Synchronize the actual canvas
   * DOM element with the signature image.
   *
   * This effect is intentionally only
   * concerned with the external canvas
   * API. It does not call setState().
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
    context.strokeStyle =
      "#181818";

    if (
      !field.signatureImage
    ) {
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
   * Start drawing.
   */
  const handlePointerDown = (
    event: ReactPointerEvent<HTMLCanvasElement>,
  ) => {
    event.stopPropagation();

    if (
      mode !== "draw"
    ) {
      return;
    }

    const canvas =
      canvasRef.current;

    if (!canvas) {
      return;
    }

    canvas.setPointerCapture(
      event.pointerId,
    );

    const rect =
      canvas.getBoundingClientRect();

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
   * Finish drawing and save the
   * signature as a PNG data URL.
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
   * Clear the drawn signature.
   */
  const handleClearDrawing = (
    event: React.MouseEvent<HTMLButtonElement>,
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
    event: React.MouseEvent,
  ) => {
    event.stopPropagation();

    onSelect(
      field.id,
    );

    onUpdate(
      field.id,
      {
        signatureMode:
          nextMode,
      },
    );
  };

  /*
   * Typed signature.
   *
   * field.value is the source of
   * truth, so there is no second
   * state value to synchronize.
   */
  const handleTypedChange = (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const value =
      event.target.value;

    onUpdate(
      field.id,
      {
        value,
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
          signatureImage: result,
        },
      );
    };

    reader.readAsDataURL(
      file,
    );

    /*
     * Allows the same file to be
     * selected again.
     */
    event.target.value = "";
  };

  /*
   * Start dragging the signature.
   */
  const handleDragStart = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    const target =
      event.target as HTMLElement;

    /*
     * Do not start a field drag when
     * interacting with controls,
     * resize handles, inputs or delete.
     */
    if (
      target.closest(
        ".signature-controls",
      ) ||
      target.closest(
        ".signature-resize-handle",
      ) ||
      target.closest(
        ".field-delete",
      ) ||
      target.closest(
        "input",
      ) ||
      target.closest(
        "label",
      ) ||
      target.closest(
        "button",
      )
    ) {
      return;
    }

    event.stopPropagation();

    onSelect(
      field.id,
    );

    const element =
      ((event.currentTarget.closest(
        ".signature-field"
      )) as HTMLDivElement | null) ??
      event.currentTarget;

    const rect =
      element.getBoundingClientRect();

    dragState.current = {
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
   * Move signature.
   */
  const handleDragMove = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (
      !dragState.current
    ) {
      return;
    }

    event.stopPropagation();

    const fieldElement =
      ((event.currentTarget.closest(
        ".signature-field"
      )) as HTMLDivElement | null) ??
      event.currentTarget;

    const parent =
      fieldElement.offsetParent as
        | HTMLElement
        | null;

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
        field.width,
    );

    const maxY = Math.max(
      0,
      parent.offsetHeight -
        field.height,
    );

    onUpdate(
      field.id,
      {
        x: Math.min(
          maxX,
          Math.max(0, newX),
        ),
        y: Math.min(
          maxY,
          Math.max(0, newY),
        ),
      },
    );
  };

  /*
   * Finish dragging.
   */
  const handleDragEnd = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (
      !dragState.current
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

    dragState.current =
      null;
  };

  /*
   * Start resizing.
   */
  const handleResizeStart = (
    event: ReactPointerEvent<HTMLDivElement>,
    direction:
      ResizeState["direction"],
  ) => {
    event.stopPropagation();

    onSelect(
      field.id,
    );

    resizeState.current = {
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

    const fieldElement =
      ((event.currentTarget.closest(
        ".signature-field"
      )) as HTMLDivElement | null) ??
      event.currentTarget;

    fieldElement.setPointerCapture(
      event.pointerId,
    );
  };

  /*
   * Resize signature.
   */
  const handleResizeMove = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    const state =
      resizeState.current;

    if (!state) {
      return;
    }

    event.stopPropagation();

    const deltaX =
      event.clientX -
      state.startX;

    const deltaY =
      event.clientY -
      state.startY;

    const fieldElement =
      ((event.currentTarget.closest(
        ".signature-field"
      )) as HTMLDivElement | null) ??
      event.currentTarget;

    const parent =
      fieldElement.offsetParent as
        | HTMLElement
        | null;

    const scaleX =
      parent && parent.offsetWidth > 0
        ? parent.getBoundingClientRect().width /
          parent.offsetWidth
        : 1;

    const scaleY =
      parent && parent.offsetHeight > 0
        ? parent.getBoundingClientRect().height /
          parent.offsetHeight
        : 1;

    const coordinateDeltaX =
      deltaX / Math.max(scaleX, 0.0001);

    const coordinateDeltaY =
      deltaY / Math.max(scaleY, 0.0001);

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
     * Right handle:
     * resize width only.
     */
    if (
      state.direction ===
      "right"
    ) {
      onUpdate(
        field.id,
        {
          width: Math.max(
            MIN_WIDTH,
            startWidth +
              coordinateDeltaX,
          ),
        },
      );

      return;
    }

    /*
     * Bottom handle:
     * resize height only.
     */
    if (
      state.direction ===
      "bottom"
    ) {
      onUpdate(
        field.id,
        {
          height: Math.max(
            MIN_HEIGHT,
            startHeight +
              coordinateDeltaY,
          ),
        },
      );

      return;
    }

    /*
     * Corner handle:
     *
     * Preserve the original
     * signature aspect ratio.
     */
    const aspectRatio =
      startWidth /
      startHeight;

    const horizontalWidth =
      Math.max(
        MIN_WIDTH,
        startWidth +
          coordinateDeltaX,
      );

    const horizontalHeight =
      Math.max(
        MIN_HEIGHT,
        horizontalWidth /
          aspectRatio,
      );

    const verticalHeight =
      Math.max(
        MIN_HEIGHT,
        startHeight +
          coordinateDeltaY,
      );

    const verticalWidth =
      Math.max(
        MIN_WIDTH,
        verticalHeight *
          aspectRatio,
      );

    if (
      Math.abs(deltaX) >=
      Math.abs(deltaY)
    ) {
      onUpdate(
        field.id,
        {
          width:
            horizontalWidth,
          height:
            horizontalHeight,
        },
      );
    } else {
      onUpdate(
        field.id,
        {
          width:
            verticalWidth,
          height:
            verticalHeight,
        },
      );
    }
  };

  /*
   * Finish resizing.
   */
  const handleResizeEnd = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (
      !resizeState.current
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

    resizeState.current =
      null;
  };

  /*
   * Delete signature.
   */
  const handleDelete = (
    event: React.MouseEvent<HTMLButtonElement>,
  ) => {
    event.stopPropagation();

    onDelete(
      field.id,
    );
  };

  /*
   * Dynamically reduce typed
   * signature font size as the
   * field becomes narrower.
   *
   * This prevents typed signatures
   * from being visibly cut off.
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
        touchAction: "none",
        width: Math.max(
          MIN_WIDTH,
          field.width,
        ),
        height: Math.max(
          MIN_HEIGHT,
          field.height,
        ),
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

        onSelect(
          field.id,
        );
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

          <button
            type="button"
            className="field-delete signature-delete-button"
            onClick={
              handleDelete
            }
            aria-label="Delete signature"
            title="Delete signature"
          >
            ×
          </button>
        </div>
      )}

      {selected && (
        <div
          className="field-drag-handle signature-drag-handle"
          role="button"
          aria-label="Move signature field"
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

      {mode === "draw" && (
        <div className="signature-draw-area">
          <canvas
            ref={canvasRef}
            className="signature-canvas"
            width={700}
            height={260}
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
            placeholder="Type your signature"
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

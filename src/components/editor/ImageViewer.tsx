import {
  useEffect,
  useRef,
  useState,
} from "react";

import type { MouseEvent } from "react";

import type { DocumentField } from "../../types/document";

import TextField from "./TextField";
import SignatureField from "./SignatureField";
import DateField from "./DateField";
import CheckboxField from "./CheckboxField";
import NameField from "./NameField";
import EmailField from "./EmailField";

interface ImageViewerProps {
  file: File;
  activeTool: string;
  fields: DocumentField[];
  selectedFieldId: string | null;

  zoom?: number;

  onAddField: (
    page: number,
    x: number,
    y: number,
    scale?: number,
  ) => void;

  onUpdateField: (
    id: string,
    updates: Partial<DocumentField>,
  ) => void;

  onDeleteField: (
    id: string,
  ) => void;

  onSelectField: (
    id: string,
  ) => void;
}

const SUPPORTED_TOOLS = new Set([
  "text",
  "signature",
  "date",
  "checkbox",
  "name",
  "email",
]);

const FIELD_DISPLAY_SIZES: Record<
  string,
  {
    width: number;
    height: number;
  }
> = {
  text: {
    width: 200,
    height: 42,
  },

  signature: {
    width: 320,
    height: 140,
  },

  date: {
    width: 180,
    height: 42,
  },

  checkbox: {
    width: 36,
    height: 36,
  },

  name: {
    width: 240,
    height: 42,
  },

  email: {
    width: 280,
    height: 42,
  },
};

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 1.5;

const clamp = (
  value: number,
  min: number,
  max: number,
) =>
  Math.min(
    max,
    Math.max(min, value),
  );

export default function ImageViewer({
  file,
  activeTool,
  fields,
  selectedFieldId,
  zoom = 100,
  onAddField,
  onUpdateField,
  onDeleteField,
  onSelectField,
}: ImageViewerProps) {
  const imageRef =
    useRef<HTMLImageElement | null>(null);

  const frameRef =
    useRef<HTMLDivElement | null>(null);

  const viewerRef =
    useRef<HTMLDivElement | null>(null);

  const [imageUrl, setImageUrl] =
    useState("");

  const [imageLoaded, setImageLoaded] =
    useState(false);

  const [naturalWidth, setNaturalWidth] =
    useState(0);

  const [naturalHeight, setNaturalHeight] =
    useState(0);

  const [fitDisplayWidth, setFitDisplayWidth] =
    useState(0);

  /*
   * --------------------------------------------------
   * NORMALIZED ZOOM
   * --------------------------------------------------
   */

  const safeZoom =
    clamp(
      Number.isFinite(zoom)
        ? zoom / 100
        : 1,
      MIN_ZOOM,
      MAX_ZOOM,
    );

  /*
   * --------------------------------------------------
   * READ IMAGE
   * --------------------------------------------------
   */

  useEffect(() => {
    let cancelled = false;

    const reader =
      new FileReader();

    reader.onload = () => {
      if (cancelled) {
        return;
      }

      if (
        typeof reader.result !==
        "string"
      ) {
        return;
      }

      setImageUrl(
        reader.result,
      );

      setImageLoaded(false);
      setNaturalWidth(0);
      setNaturalHeight(0);
      setFitDisplayWidth(0);
    };

    reader.onerror = () => {
      if (cancelled) {
        return;
      }

      setImageUrl("");
      setImageLoaded(false);
      setNaturalWidth(0);
      setNaturalHeight(0);
      setFitDisplayWidth(0);
    };

    reader.readAsDataURL(file);

    return () => {
      cancelled = true;

      if (
        reader.readyState ===
        FileReader.LOADING
      ) {
        reader.abort();
      }
    };
  }, [file]);

  /*
   * --------------------------------------------------
   * RESPONSIVE FIT WIDTH
   *
   * fitDisplayWidth represents the width the image
   * would naturally occupy at 100% zoom.
   *
   * The actual displayed width is calculated from
   * this value and safeZoom.
   * --------------------------------------------------
   */

  useEffect(() => {
    if (!imageLoaded) {
      return;
    }

    const viewer =
      viewerRef.current;

    if (!viewer) {
      return;
    }

    if (!naturalWidth || !naturalHeight) {
      return;
    }

    const updateDisplaySize = () => {
      const viewerWidth =
        viewer.clientWidth;

      if (viewerWidth <= 0) {
        return;
      }

      const horizontalPadding =
        viewerWidth <= 480
          ? 8
          : 24;

      const availableWidth =
        Math.max(
          1,
          viewerWidth -
            horizontalPadding * 2,
        );

      const nextWidth =
        Math.min(
          naturalWidth,
          availableWidth,
        );

      setFitDisplayWidth(
        Math.max(
          1,
          nextWidth,
        ),
      );
    };

    updateDisplaySize();

    const observer =
      new ResizeObserver(
        updateDisplaySize,
      );

    observer.observe(viewer);

    return () => {
      observer.disconnect();
    };
  }, [
    imageLoaded,
    naturalWidth,
    naturalHeight,
  ]);

  /*
   * --------------------------------------------------
   * IMAGE LOAD
   * --------------------------------------------------
   */

  const handleImageLoad = () => {
    const image =
      imageRef.current;

    if (!image) {
      return;
    }

    const width =
      image.naturalWidth;

    const height =
      image.naturalHeight;

    if (!width || !height) {
      return;
    }

    setNaturalWidth(width);
    setNaturalHeight(height);

    setFitDisplayWidth(
      image.clientWidth ||
        width,
    );

    setImageLoaded(true);
  };

  /*
   * --------------------------------------------------
   * DISPLAY DIMENSIONS
   * --------------------------------------------------
   *
   * The image always keeps its original coordinate
   * system internally.
   *
   * Zoom only changes the visual scale.
   * --------------------------------------------------
   */

  const baseWidth =
    fitDisplayWidth > 0
      ? fitDisplayWidth
      : naturalWidth;

  const displayWidth =
    Math.max(
      1,
      baseWidth * safeZoom,
    );

  const safeScale =
    naturalWidth > 0
      ? displayWidth /
        naturalWidth
      : 1;

  const displayHeight =
    naturalHeight *
    safeScale;

  /*
   * --------------------------------------------------
   * FIELD MODE
   * --------------------------------------------------
   */

  const canAddField =
    SUPPORTED_TOOLS.has(
      activeTool,
    );

  /*
   * --------------------------------------------------
   * ADD FIELD
   *
   * The click happens in displayed coordinates.
   *
   * We convert the click back into the original
   * image coordinate system before saving the field.
   *
   * This keeps fields stable when zoom changes.
   * --------------------------------------------------
   */

  const handlePageClick = (
    event: MouseEvent<HTMLDivElement>,
  ) => {
    if (!canAddField) {
      return;
    }

    const frame =
      frameRef.current;

    if (!frame) {
      return;
    }

    const target =
      event.target as HTMLElement;

    if (
      target.closest(
        ".document-field",
      ) ||
      target.closest(
        ".signature-field",
      ) ||
      target.closest(
        ".date-field",
      ) ||
      target.closest(
        ".checkbox-field",
      ) ||
      target.closest(
        ".name-field",
      ) ||
      target.closest(
        ".email-field",
      )
    ) {
      return;
    }

    const rect =
      frame.getBoundingClientRect();

    if (
      rect.width <= 0 ||
      rect.height <= 0
    ) {
      return;
    }

    const displayX =
      event.clientX -
      rect.left;

    const displayY =
      event.clientY -
      rect.top;

    const fieldSize =
      FIELD_DISPLAY_SIZES[
        activeTool
      ] ??
      FIELD_DISPLAY_SIZES.text;

    /*
     * Field dimensions are stored in the original
     * image coordinate system.
     *
     * Convert them to the currently displayed size
     * before clamping the click.
     */

    const fieldDisplayWidth =
      fieldSize.width *
      safeScale;

    const fieldDisplayHeight =
      fieldSize.height *
      safeScale;

    const maxDisplayX =
      Math.max(
        0,
        rect.width -
          fieldDisplayWidth,
      );

    const maxDisplayY =
      Math.max(
        0,
        rect.height -
          fieldDisplayHeight,
      );

    const clampedDisplayX =
      Math.min(
        maxDisplayX,
        Math.max(
          0,
          displayX,
        ),
      );

    const clampedDisplayY =
      Math.min(
        maxDisplayY,
        Math.max(
          0,
          displayY,
        ),
      );

    /*
     * Convert displayed coordinates back into
     * original image coordinates.
     */

    const x =
      clampedDisplayX /
      safeScale;

    const y =
      clampedDisplayY /
      safeScale;

    onAddField(
      1,
      x,
      y,
      safeScale,
    );
  };

  /*
   * --------------------------------------------------
   * FIELD RENDERING
   * --------------------------------------------------
   */

  const renderField = (
    field: DocumentField,
  ) => {
    const commonProps = {
      field,

      selected:
        selectedFieldId ===
        field.id,

      onUpdate:
        onUpdateField,

      onDelete:
        onDeleteField,

      onSelect:
        onSelectField,
    };

    switch (field.type) {
      case "text":
        return (
          <TextField
            key={field.id}
            {...commonProps}
          />
        );

      case "signature":
        return (
          <SignatureField
            key={field.id}
            {...commonProps}
          />
        );

      case "date":
        return (
          <DateField
            key={field.id}
            {...commonProps}
          />
        );

      case "checkbox":
        return (
          <CheckboxField
            key={field.id}
            {...commonProps}
          />
        );

      case "name":
        return (
          <NameField
            key={field.id}
            {...commonProps}
          />
        );

      case "email":
        return (
          <EmailField
            key={field.id}
            {...commonProps}
          />
        );

      default:
        return null;
    }
  };

  /*
   * --------------------------------------------------
   * LOADING STATE
   * --------------------------------------------------
   */

  if (!imageUrl) {
    return (
      <div
        className="image-loading"
        style={{
          width: "100%",
          maxWidth: "100%",
          minHeight: 280,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxSizing: "border-box",
          padding: 24,
          color: "#6f6f6a",
          fontSize: 14,
          overflow: "hidden",
        }}
      >
        Loading image...
      </div>
    );
  }

  /*
   * --------------------------------------------------
   * INITIAL IMAGE LOAD
   * --------------------------------------------------
   */

  if (
    !imageLoaded ||
    !naturalWidth ||
    !naturalHeight
  ) {
    return (
      <div
        ref={viewerRef}
        style={{
          width: "100%",
          maxWidth: "100%",
          minWidth: 0,
          display: "flex",
          justifyContent: "center",
          alignItems: "flex-start",
          padding: "16px 8px",
          boxSizing: "border-box",
          overflow: "hidden",
        }}
      >
        <img
          ref={imageRef}
          src={imageUrl}
          alt="Uploaded document"
          onLoad={handleImageLoad}
          draggable={false}
          style={{
            display: "block",
            width: "auto",
            maxWidth: "100%",
            minWidth: 0,
            height: "auto",
            maxHeight:
              "calc(100vh - 150px)",
            objectFit: "contain",
            userSelect: "none",
            pointerEvents: "none",
          }}
        />
      </div>
    );
  }

  /*
   * --------------------------------------------------
   * RESPONSIVE IMAGE EDITOR
   * --------------------------------------------------
   */

  return (
    <div
      ref={viewerRef}
      className="image-document"
      style={{
        width: "100%",
        maxWidth: "100%",
        minWidth: 0,
        minHeight: "100%",
        boxSizing: "border-box",
        padding:
          "16px 8px",
        overflow: "hidden",
        overscrollBehaviorX:
          "none",
      }}
    >
      {/*
       * This inner container owns horizontal scrolling.
       *
       * This is intentional because the global responsive
       * CSS locks horizontal overflow on the main canvas.
       *
       * At normal zoom the image remains centered.
       * At larger zoom the image becomes scrollable.
       */}

      <div
        className="image-scroll-container"
        style={{
          width: "100%",
          maxWidth: "100%",
          minWidth: 0,
          overflowX:
            safeZoom > 1
              ? "auto"
              : "hidden",
          overflowY: "visible",
          overscrollBehaviorX:
            "contain",
          overscrollBehaviorY:
            "contain",
          WebkitOverflowScrolling:
            "touch",
          touchAction:
            safeZoom > 1
              ? "pan-x pan-y"
              : "auto",
          boxSizing:
            "border-box",
          display: "flex",
          justifyContent:
            safeZoom <= 1
              ? "center"
              : "flex-start",
          alignItems:
            "flex-start",
        }}
      >
        <div
          ref={frameRef}
          className={
            canAddField
              ? "image-page-field-mode"
              : ""
          }
          onClick={
            handlePageClick
          }
          style={{
            position: "relative",

            width:
              `${displayWidth}px`,

            height:
              `${displayHeight}px`,

            flex:
              "0 0 auto",

            background:
              "#ffffff",

            boxShadow:
              "0 8px 30px rgba(0, 0, 0, 0.12)",

            overflow:
              "visible",

            boxSizing:
              "border-box",

            cursor:
              canAddField
                ? "crosshair"
                : "default",

            touchAction:
              canAddField
                ? "manipulation"
                : "auto",
          }}
        >
          {/*
           * ------------------------------------------------
           * INTERNAL DOCUMENT
           * ------------------------------------------------
           *
           * Everything inside this element uses the
           * original image dimensions.
           *
           * The complete document is visually scaled
           * with one transform.
           */}

          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,

              width:
                `${naturalWidth}px`,

              height:
                `${naturalHeight}px`,

              minWidth:
                `${naturalWidth}px`,

              minHeight:
                `${naturalHeight}px`,

              transformOrigin:
                "top left",

              transform:
                `scale(${safeScale})`,
            }}
          >
            <img
              ref={imageRef}
              src={imageUrl}
              alt="Uploaded document"
              draggable={false}
              style={{
                display: "block",

                width:
                  `${naturalWidth}px`,

                height:
                  `${naturalHeight}px`,

                maxWidth:
                  "none",

                maxHeight:
                  "none",

                minWidth:
                  `${naturalWidth}px`,

                minHeight:
                  `${naturalHeight}px`,

                userSelect:
                  "none",

                WebkitUserSelect:
                  "none",

                pointerEvents:
                  "none",
              }}
            />

            {/*
             * ------------------------------------------------
             * FIELD LAYER
             * ------------------------------------------------
             *
             * Field coordinates are always stored against
             * the original image dimensions.
             *
             * Because this layer lives inside the transformed
             * document, fields automatically follow zoom.
             */}

            <div
              className="image-field-layer"
              style={{
                position:
                  "absolute",

                top: 0,
                left: 0,

                width:
                  `${naturalWidth}px`,

                height:
                  `${naturalHeight}px`,

                minWidth:
                  `${naturalWidth}px`,

                minHeight:
                  `${naturalHeight}px`,

                pointerEvents:
                  "none",

                overflow:
                  "visible",

                lineHeight:
                  "normal",

                zIndex: 20,
              }}
            >
              {fields
                .filter(
                  (field) =>
                    field.page === 1,
                )
                .map(
                  renderField,
                )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
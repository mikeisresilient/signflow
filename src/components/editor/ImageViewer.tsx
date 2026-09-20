import { useEffect, useRef, useState } from "react";

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

export default function ImageViewer({
  file,
  activeTool,
  fields,
  selectedFieldId,
  onAddField,
  onUpdateField,
  onDeleteField,
  onSelectField,
}: ImageViewerProps) {
  const imageRef =
    useRef<HTMLImageElement | null>(null);

  const frameRef =
    useRef<HTMLDivElement | null>(null);

  const [imageUrl, setImageUrl] =
    useState("");

  const [imageLoaded, setImageLoaded] =
    useState(false);

  const [naturalWidth, setNaturalWidth] =
    useState(0);

  const [naturalHeight, setNaturalHeight] =
    useState(0);

  const [displayWidth, setDisplayWidth] =
    useState(0);

  /*
   * Read the uploaded image as a data URL.
   */
  useEffect(() => {
    let cancelled = false;

    const reader = new FileReader();

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

      setImageUrl(reader.result);
      setImageLoaded(false);
      setNaturalWidth(0);
      setNaturalHeight(0);
      setDisplayWidth(0);
    };

    reader.onerror = () => {
      if (cancelled) {
        return;
      }

      setImageUrl("");
      setImageLoaded(false);
    };

    reader.readAsDataURL(file);

    return () => {
      cancelled = true;
      reader.abort();
    };
  }, [file]);

  /*
   * Keep the image responsive.
   *
   * Field coordinates remain based on
   * the original image dimensions.
   */
  useEffect(() => {
    if (!imageLoaded) {
      return;
    }

    const image =
      imageRef.current;

    if (!image) {
      return;
    }

    const parent =
      frameRef.current?.parentElement;

    if (!parent) {
      return;
    }

    const updateDisplaySize = () => {
      if (
        !naturalWidth ||
        !naturalHeight
      ) {
        return;
      }

      const availableWidth =
        Math.max(
          1,
          parent.clientWidth - 32,
        );

      const nextWidth =
        Math.min(
          naturalWidth,
          availableWidth,
        );

      setDisplayWidth(
        nextWidth,
      );
    };

    updateDisplaySize();

    const observer =
      new ResizeObserver(
        updateDisplaySize,
      );

    observer.observe(parent);

    return () => {
      observer.disconnect();
    };
  }, [
    imageLoaded,
    naturalWidth,
    naturalHeight,
  ]);

  const handleImageLoad = () => {
    const image =
      imageRef.current;

    if (!image) {
      return;
    }

    setNaturalWidth(
      image.naturalWidth,
    );

    setNaturalHeight(
      image.naturalHeight,
    );

    setDisplayWidth(
      image.clientWidth ||
        image.naturalWidth,
    );

    setImageLoaded(true);
  };

  const scale =
    naturalWidth > 0 &&
    displayWidth > 0
      ? displayWidth /
        naturalWidth
      : 1;

  const displayHeight =
    naturalHeight * scale;

  const canAddField =
    activeTool === "text" ||
    activeTool === "signature" ||
    activeTool === "date" ||
    activeTool === "checkbox" ||
    activeTool === "name" ||
    activeTool === "email";

  const handlePageClick = (
    event: React.MouseEvent<HTMLDivElement>,
  ) => {
    if (!canAddField) {
      return;
    }

    const frame =
      frameRef.current;

    if (!frame) {
      return;
    }

    /*
     * Convert the visible screen coordinate
     * back into the original image coordinate.
     */
    const rect =
      frame.getBoundingClientRect();

    const displayX =
      event.clientX -
      rect.left;

    const displayY =
      event.clientY -
      rect.top;

    /* Existing fields and their controls must never create
       another field underneath the current interaction. */
    const target =
      event.target as HTMLElement;

    if (
      target.closest(
        ".document-field, .signature-field, .date-field, .checkbox-field, .name-field, .email-field, .field-drag-handle, .field-delete, .field-resize-handle, .signature-resize-handle, .date-resize-handle, .checkbox-resize-handle, .name-resize-handle, .email-resize-handle"
      )
    ) {
      return;
    }

    const displayFieldWidth =
      activeTool === "signature"
        ? 320
        : activeTool === "date"
          ? 180
          : activeTool === "checkbox"
            ? 36
            : activeTool === "name"
              ? 240
              : activeTool === "email"
                ? 280
                : 200;

    const displayFieldHeight =
      activeTool === "signature"
        ? 140
        : activeTool === "checkbox"
          ? 36
          : 42;

    const clampedDisplayX =
      Math.min(
        Math.max(0, rect.width - displayFieldWidth),
        Math.max(0, displayX),
      );

    const clampedDisplayY =
      Math.min(
        Math.max(0, rect.height - displayFieldHeight),
        Math.max(0, displayY),
      );

    const x =
      clampedDisplayX / scale;

    const y =
      clampedDisplayY / scale;

    onAddField(
      1,
      x,
      y,
      scale,
    );
  };

  if (!imageUrl) {
    return (
      <div
        className="image-loading"
        style={{
          width: "100%",
          minHeight: 400,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#6f6f6a",
          fontSize: 14,
        }}
      >
        Loading image...
      </div>
    );
  }

  if (
    !imageLoaded ||
    !naturalWidth ||
    !naturalHeight
  ) {
    return (
      <div
        style={{
          width: "100%",
          display: "flex",
          justifyContent: "center",
          padding: 24,
          boxSizing: "border-box",
        }}
      >
        <img
          ref={imageRef}
          src={imageUrl}
          alt="Uploaded document"
          onLoad={handleImageLoad}
          style={{
            display: "block",
            width: "auto",
            maxWidth: "100%",
            height: "auto",
            maxHeight:
              "calc(100vh - 150px)",
          }}
          draggable={false}
        />
      </div>
    );
  }

  return (
    <div
      className="image-document"
      style={{
        width: "100%",
        minHeight: "100%",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: 16,
        boxSizing: "border-box",
      }}
    >
      <div
        ref={frameRef}
        className={
          canAddField
            ? "image-page-field-mode"
            : ""
        }
        onClick={handlePageClick}
        style={{
          position: "relative",
          width: displayWidth,
          height: displayHeight,
          maxWidth: "100%",
          flexShrink: 0,
          background: "#ffffff",
          boxShadow:
            "0 8px 30px rgba(0, 0, 0, 0.12)",
          overflow: "visible",
          cursor: canAddField
            ? "crosshair"
            : "default",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: naturalWidth,
            height: naturalHeight,
            transformOrigin:
              "top left",
            transform:
              `scale(${scale})`,
          }}
        >
          <img
            ref={imageRef}
            src={imageUrl}
            alt="Uploaded document"
            draggable={false}
            style={{
              display: "block",
              width: naturalWidth,
              height: naturalHeight,
              maxWidth: "none",
              maxHeight: "none",
              userSelect: "none",
              pointerEvents: "none",
            }}
          />

          <div
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
            }}
          >
            {fields
              .filter(
                (field) =>
                  field.page === 1,
              )
              .map((field) => {
                if (
                  field.type === "text"
                ) {
                  return (
                    <TextField
                      key={field.id}
                      field={field}
                      selected={
                        selectedFieldId ===
                        field.id
                      }
                      onUpdate={
                        onUpdateField
                      }
                      onDelete={
                        onDeleteField
                      }
                      onSelect={
                        onSelectField
                      }
                    />
                  );
                }

                if (
                  field.type ===
                  "signature"
                ) {
                  return (
                    <SignatureField
                      key={field.id}
                      field={field}
                      selected={
                        selectedFieldId ===
                        field.id
                      }
                      onUpdate={
                        onUpdateField
                      }
                      onDelete={
                        onDeleteField
                      }
                      onSelect={
                        onSelectField
                      }
                    />
                  );
                }

                if (
                  field.type === "date"
                ) {
                  return (
                    <DateField
                      key={field.id}
                      field={field}
                      selected={
                        selectedFieldId ===
                        field.id
                      }
                      onUpdate={
                        onUpdateField
                      }
                      onDelete={
                        onDeleteField
                      }
                      onSelect={
                        onSelectField
                      }
                    />
                  );
                }

                if (
                  field.type ===
                  "checkbox"
                ) {
                  return (
                    <CheckboxField
                      key={field.id}
                      field={field}
                      selected={
                        selectedFieldId ===
                        field.id
                      }
                      onUpdate={
                        onUpdateField
                      }
                      onDelete={
                        onDeleteField
                      }
                      onSelect={
                        onSelectField
                      }
                    />
                  );
                }

                if (
                  field.type === "name"
                ) {
                  return (
                    <NameField
                      key={field.id}
                      field={field}
                      selected={
                        selectedFieldId ===
                        field.id
                      }
                      onUpdate={
                        onUpdateField
                      }
                      onDelete={
                        onDeleteField
                      }
                      onSelect={
                        onSelectField
                      }
                    />
                  );
                }

                if (
                  field.type === "email"
                ) {
                  return (
                    <EmailField
                      key={field.id}
                      field={field}
                      selected={
                        selectedFieldId ===
                        field.id
                      }
                      onUpdate={
                        onUpdateField
                      }
                      onDelete={
                        onDeleteField
                      }
                      onSelect={
                        onSelectField
                      }
                    />
                  );
                }

                return null;
              })}
          </div>
        </div>
      </div>
    </div>
  );
}

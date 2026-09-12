export type FieldType =
  | "text"
  | "signature"
  | "date"
  | "checkbox"
  | "name"
  | "email";

export interface DocumentField {
  id: string;
  type: FieldType;

  page: number;

  x: number;
  y: number;

  width: number;
  height: number;

  value: string;

  /*
   * Signature-specific data.
   *
   * draw:
   * Stores the generated signature image/data URL.
   *
   * type:
   * Stores the typed signature text.
   *
   * upload:
   * Stores the uploaded signature image/data URL.
   */
  signatureMode?: "draw" | "type" | "upload";

  signatureImage?: string;

  signatureFont?: string;
}

declare module "html-docx-js/dist/html-docx" {
  interface HtmlDocx {
    asBlob(
      html: string,
      options?: {
        orientation?: "portrait" | "landscape";
        margins?: {
          top?: number;
          right?: number;
          bottom?: number;
          left?: number;
        };
      },
    ): Blob;
  }

  const htmlDocx: HtmlDocx;

  export default htmlDocx;
}
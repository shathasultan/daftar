# PDF dependencies

- jsPDF 4.2.1 (MIT), https://github.com/parallax/jsPDF
- jsPDF-AutoTable 5.0.9 (MIT), https://github.com/simonbengtsson/jsPDF-AutoTable
- Amiri Regular (SIL OFL), https://github.com/google/fonts/tree/main/ofl/amiri

`pdf.js` is an ES module bundle of jsPDF's browser entry and AutoTable, built with esbuild 0.28.2 (`--bundle --format=esm --platform=browser --minify --legal-comments=eof`). `amiri-font.js` contains the base64 representation of Amiri-Regular.ttf for jsPDF font embedding. Licenses are retained alongside these files.

Arabic table cells use RTL drawing; dates and numeric cells use LTR. Do not apply one text direction to every cell: it either reverses Arabic words or reverses numbers. Render the resulting PDF after changing font or layout.

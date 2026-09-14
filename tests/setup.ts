import "@testing-library/jest-dom/vitest";

// jsdom's Blob/File don't implement `.text()`; components under test read
// uploaded files with it (a standard, widely-supported browser API), so
// polyfill it here rather than avoiding the method in production code.
if (typeof Blob !== "undefined" && !Blob.prototype.text) {
  Blob.prototype.text = function readBlobAsText(this: Blob) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(this);
    });
  };
}

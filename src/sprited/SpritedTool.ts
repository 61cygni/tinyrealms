/* ====================================================================
   SpritedTool — standalone spritesheet authoring tool
   ==================================================================== */

// ----- Data types --------------------------------------------------

interface Tile {
  id: string;
  canvas: HTMLCanvasElement; // pre-rendered at source resolution
  srcW: number;
  srcH: number;
}

interface AnimRow {
  name: string;
  frames: Tile[];
}

// ====================================================================

export class SpritedTool {
  private root: HTMLElement;

  // tiles loaded from source images
  private tiles: Tile[] = [];
  private tileIdCounter = 0;

  // animation rows
  private rows: AnimRow[] = [];
  private selectedRowIdx = 0;

  // preview
  private previewTimer = 0;
  private previewFrame = 0;
  private previewFps = 8;

  // grid load settings
  private gridTileW = 32;
  private gridTileH = 32;
  private gridImage: HTMLImageElement | null = null; // retained for re-slicing
  private gridTiles: Tile[] = [];                    // tiles from grid (subset of this.tiles)
  private frameTiles: Tile[] = [];                   // tiles from individual frames

  // target (output) frame size — 0 means "use source size"
  private targetFrameW = 0;
  private targetFrameH = 0;

  // debounce timer for W/H reslice
  private resliceTimer = 0;
  private targetSizeTimer = 0;
  private lastResliceW = 0;
  private lastResliceH = 0;

  // DOM refs
  private tileGridEl!: HTMLDivElement;
  private rowsWrapEl!: HTMLDivElement;
  private previewCanvas!: HTMLCanvasElement;
  private previewCtx!: CanvasRenderingContext2D;
  private fpsLabel!: HTMLSpanElement;
  private filenameInput!: HTMLInputElement;
  private tileWInput!: HTMLInputElement;
  private tileHInput!: HTMLInputElement;
  private targetWInput!: HTMLInputElement;
  private targetHInput!: HTMLInputElement;
  private fileNameDisplay!: HTMLSpanElement;
  private exportInfoEl!: HTMLDivElement;

  constructor(root: HTMLElement) {
    this.root = root;
  }

  // ==== Bootstrap ====================================================

  init() {
    this.root.innerHTML = "";
    this.buildDOM();
    this.addRow(); // start with one empty row
    this.renderTileGrid();
    this.renderRows();
    this.renderPreview();
    this.updateExportInfo();
  }

  // ==== DOM Construction =============================================

  private buildDOM() {
    // ---- Top bar ----
    const topbar = el("div", "st-topbar");
    topbar.appendChild(elText("h1", "Spritesheet Tool"));
    topbar.appendChild(el("div", "st-topbar-spacer"));
    this.fileNameDisplay = elText("span", "") as HTMLSpanElement;
    this.fileNameDisplay.className = "st-filename";
    topbar.appendChild(this.fileNameDisplay);
    this.root.appendChild(topbar);

    // ---- 3-panel layout ----
    const panels = el("div", "st-panels");

    // -- Left panel --
    const left = el("div", "st-left");
    left.appendChild(elText("div", "Source Tiles", "st-section-title"));

    // Grid load area
    const loadArea = el("div", "st-load-area");

    const row1 = el("div", "st-load-row");
    const loadBtn = elText("button", "Load Grid PNG", "st-btn accent") as HTMLButtonElement;
    loadBtn.addEventListener("click", () => this.openGridFile());
    row1.appendChild(loadBtn);
    loadArea.appendChild(row1);

    const row2 = el("div", "st-load-row");
    row2.appendChild(elText("span", "W:", "st-label"));
    this.tileWInput = el("input", "st-input st-input-small") as HTMLInputElement;
    this.tileWInput.type = "number";
    this.tileWInput.value = String(this.gridTileW);
    this.tileWInput.min = "1";
    this.tileWInput.addEventListener("input", () => this.scheduleReslice());
    row2.appendChild(this.tileWInput);

    row2.appendChild(elText("span", "H:", "st-label"));
    this.tileHInput = el("input", "st-input st-input-small") as HTMLInputElement;
    this.tileHInput.type = "number";
    this.tileHInput.value = String(this.gridTileH);
    this.tileHInput.min = "1";
    this.tileHInput.addEventListener("input", () => this.scheduleReslice());
    row2.appendChild(this.tileHInput);
    loadArea.appendChild(row2);

    left.appendChild(loadArea);

    // Drop zone for individual frames
    const drop = el("div", "st-drop-zone");
    drop.textContent = "Drop individual frame PNGs here\nor click to browse";
    drop.addEventListener("click", () => this.openFrameFiles());
    drop.addEventListener("dragover", (e) => {
      e.preventDefault();
      drop.classList.add("drag-over");
    });
    drop.addEventListener("dragleave", () => drop.classList.remove("drag-over"));
    drop.addEventListener("drop", (e) => {
      e.preventDefault();
      drop.classList.remove("drag-over");
      if (e.dataTransfer?.files) this.loadFrameFiles(e.dataTransfer.files);
    });
    left.appendChild(drop);

    // Tile grid wrapper
    const tileGridWrap = el("div", "st-tile-grid-wrap");
    this.tileGridEl = el("div", "st-tile-grid") as HTMLDivElement;
    tileGridWrap.appendChild(this.tileGridEl);
    left.appendChild(tileGridWrap);

    panels.appendChild(left);

    // -- Center panel --
    const center = el("div", "st-center");

    const centerHeader = el("div", "st-center-header");
    centerHeader.appendChild(elText("div", "Animation Rows", "st-section-title"));
    const addRowBtn = elText("button", "+ Add Row", "st-btn accent") as HTMLButtonElement;
    addRowBtn.addEventListener("click", () => {
      this.addRow();
      this.renderRows();
    });
    centerHeader.appendChild(addRowBtn);
    center.appendChild(centerHeader);

    this.rowsWrapEl = el("div", "st-rows-wrap") as HTMLDivElement;
    center.appendChild(this.rowsWrapEl);

    panels.appendChild(center);

    // -- Right panel --
    const right = el("div", "st-right");
    right.appendChild(elText("div", "Preview", "st-section-title"));

    const previewWrap = el("div", "st-preview-wrap");
    this.previewCanvas = document.createElement("canvas");
    this.previewCanvas.className = "st-preview-canvas";
    this.previewCanvas.width = 128;
    this.previewCanvas.height = 128;
    this.previewCtx = this.previewCanvas.getContext("2d")!;
    this.previewCtx.imageSmoothingEnabled = false;
    previewWrap.appendChild(this.previewCanvas);

    const prevControls = el("div", "st-preview-controls");
    prevControls.appendChild(elText("span", "Speed:", "st-label"));
    const fpsRange = document.createElement("input");
    fpsRange.type = "range";
    fpsRange.min = "1";
    fpsRange.max = "30";
    fpsRange.value = String(this.previewFps);
    fpsRange.addEventListener("input", () => {
      this.previewFps = parseInt(fpsRange.value) || 8;
      this.fpsLabel.textContent = `${this.previewFps} fps`;
      this.startPreview();
    });
    prevControls.appendChild(fpsRange);
    this.fpsLabel = elText("span", `${this.previewFps} fps`, "st-label") as HTMLSpanElement;
    prevControls.appendChild(this.fpsLabel);
    previewWrap.appendChild(prevControls);
    right.appendChild(previewWrap);

    // Export section
    right.appendChild(elText("div", "Export", "st-section-title"));
    const exportSection = el("div", "st-export-section");

    const nameField = el("div", "st-export-field");
    nameField.appendChild(elText("label", "File name (without extension)"));
    this.filenameInput = el("input", "st-input") as HTMLInputElement;
    this.filenameInput.value = "spritesheet";
    this.filenameInput.addEventListener("input", () => this.updateExportInfo());
    nameField.appendChild(this.filenameInput);
    exportSection.appendChild(nameField);

    // Target frame size
    const targetField = el("div", "st-export-field");
    targetField.appendChild(elText("label", "Target frame size (blank = keep source size)"));
    const targetRow = el("div", "st-load-row");
    targetRow.appendChild(elText("span", "W:", "st-label"));
    this.targetWInput = el("input", "st-input st-input-small") as HTMLInputElement;
    this.targetWInput.type = "number";
    this.targetWInput.placeholder = "auto";
    this.targetWInput.min = "1";
    this.targetWInput.addEventListener("input", () => this.scheduleTargetSizeUpdate());
    targetRow.appendChild(this.targetWInput);
    targetRow.appendChild(elText("span", "H:", "st-label"));
    this.targetHInput = el("input", "st-input st-input-small") as HTMLInputElement;
    this.targetHInput.type = "number";
    this.targetHInput.placeholder = "auto";
    this.targetHInput.min = "1";
    this.targetHInput.addEventListener("input", () => this.scheduleTargetSizeUpdate());
    targetRow.appendChild(this.targetHInput);
    targetField.appendChild(targetRow);
    exportSection.appendChild(targetField);

    this.exportInfoEl = el("div", "st-export-info") as HTMLDivElement;
    exportSection.appendChild(this.exportInfoEl);

    const exportBtn = elText("button", "Export PNG + JSON", "st-btn accent") as HTMLButtonElement;
    exportBtn.style.marginTop = "4px";
    exportBtn.addEventListener("click", () => this.doExport());
    exportSection.appendChild(exportBtn);

    right.appendChild(exportSection);
    panels.appendChild(right);

    this.root.appendChild(panels);
  }

  // ==== Tile Loading =================================================

  private openGridFile() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg,image/webp";
    input.addEventListener("change", () => {
      if (!input.files?.length) return;
      this.loadGridImage(input.files[0]);
    });
    input.click();
  }

  private loadGridImage(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        this.gridImage = img;
        this.lastResliceW = 0;
        this.lastResliceH = 0;
        this.gridTileW = Math.max(1, parseInt(this.tileWInput.value) || 32);
        this.gridTileH = Math.max(1, parseInt(this.tileHInput.value) || 32);
        this.fileNameDisplay.textContent = file.name;
        this.resliceGrid();
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  }

  /** Debounced reslice — waits 400ms after the last input before re-slicing */
  private scheduleReslice() {
    if (this.resliceTimer) clearTimeout(this.resliceTimer);
    this.resliceTimer = window.setTimeout(() => {
      const nextW = Math.max(1, parseInt(this.tileWInput.value) || 32);
      const nextH = Math.max(1, parseInt(this.tileHInput.value) || 32);
      if (nextW === this.gridTileW && nextH === this.gridTileH) return;
      this.gridTileW = nextW;
      this.gridTileH = nextH;
      this.resliceGrid();
    }, 400);
  }

  /** Debounced update for target output frame size controls (W/H). */
  private scheduleTargetSizeUpdate() {
    if (this.targetSizeTimer) clearTimeout(this.targetSizeTimer);
    this.targetSizeTimer = window.setTimeout(() => {
      const nextW = parseInt(this.targetWInput.value) || 0;
      const nextH = parseInt(this.targetHInput.value) || 0;
      if (nextW === this.targetFrameW && nextH === this.targetFrameH) return;
      this.targetFrameW = nextW;
      this.targetFrameH = nextH;
      this.updateExportInfo();
      this.renderPreview();
      this.startPreview();
    }, 80);
  }

  /** Re-slice the stored grid image with the current W/H values */
  private resliceGrid() {
    const img = this.gridImage;
    if (!img) return;
    const tw = this.gridTileW;
    const th = this.gridTileH;
    if (this.lastResliceW === tw && this.lastResliceH === th) return;

    const cols = Math.floor(img.width / tw);
    const rows = Math.floor(img.height / th);

    // Safety: skip slicing if it would produce an unreasonable number of tiles
    // (e.g. user is mid-typing "32" and it fires on "3")
    const MAX_TILES = 10000;
    if (cols * rows > MAX_TILES) {
      console.warn(`[SpritedTool] Skipping reslice: ${cols}×${rows} = ${cols * rows} tiles exceeds limit`);
      return;
    }

    // Remove old grid tiles from the combined list
    const gridIds = new Set(this.gridTiles.map((t) => t.id));
    this.tiles = this.tiles.filter((t) => !gridIds.has(t.id));
    this.gridTiles = [];

    // Use a single offscreen canvas for blank-checking instead of one per tile
    const tmpCanvas = document.createElement("canvas");
    tmpCanvas.width = tw;
    tmpCanvas.height = th;
    const tmpCtx = tmpCanvas.getContext("2d")!;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        // Draw into the shared tmp canvas for blank-checking
        tmpCtx.clearRect(0, 0, tw, th);
        tmpCtx.drawImage(img, c * tw, r * th, tw, th, 0, 0, tw, th);

        // skip fully transparent tiles
        if (this.isTileBlank(tmpCtx, tw, th)) continue;

        // Only allocate a per-tile canvas for non-blank tiles
        const tc = document.createElement("canvas");
        tc.width = tw;
        tc.height = th;
        const ctx = tc.getContext("2d")!;
        ctx.drawImage(img, c * tw, r * th, tw, th, 0, 0, tw, th);

        const tile: Tile = {
          id: `t${this.tileIdCounter++}`,
          canvas: tc,
          srcW: tw,
          srcH: th,
        };
        this.gridTiles.push(tile);
      }
    }

    // Rebuild combined list: grid tiles first, then individual frame tiles
    this.tiles = [...this.gridTiles, ...this.frameTiles];
    this.lastResliceW = tw;
    this.lastResliceH = th;
    this.renderTileGrid();
    this.updateExportInfo();
  }

  private isTileBlank(ctx: CanvasRenderingContext2D, w: number, h: number): boolean {
    const data = ctx.getImageData(0, 0, w, h).data;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] > 0) return false;
    }
    return true;
  }

  private openFrameFiles() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg,image/webp";
    input.multiple = true;
    input.addEventListener("change", () => {
      if (input.files) this.loadFrameFiles(input.files);
    });
    input.click();
  }

  private loadFrameFiles(files: FileList) {
    Array.from(files).forEach((file) => {
      if (!file.type.startsWith("image/")) return;
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const tc = document.createElement("canvas");
          tc.width = img.width;
          tc.height = img.height;
          const ctx = tc.getContext("2d")!;
          ctx.drawImage(img, 0, 0);
          const tile: Tile = {
            id: `t${this.tileIdCounter++}`,
            canvas: tc,
            srcW: img.width,
            srcH: img.height,
          };
          this.frameTiles.push(tile);
          this.tiles = [...this.gridTiles, ...this.frameTiles];
          this.renderTileGrid();
          this.updateExportInfo();
        };
        img.src = reader.result as string;
      };
      reader.readAsDataURL(file);
    });
  }

  // ==== Tile Grid Rendering ==========================================

  private renderTileGrid() {
    this.tileGridEl.innerHTML = "";

    if (this.tiles.length === 0) {
      const empty = el("div", "st-empty-state");
      empty.innerHTML = `<div class="st-empty-icon">🖼️</div>Load a grid PNG or drop frame images`;
      this.tileGridEl.appendChild(empty);
      return;
    }

    this.tiles.forEach((tile) => {
      const wrap = el("div", "st-tile");
      const display = document.createElement("canvas");
      const scale = 48 / Math.max(tile.srcW, tile.srcH);
      display.width = Math.round(tile.srcW * scale);
      display.height = Math.round(tile.srcH * scale);
      display.style.width = display.width + "px";
      display.style.height = display.height + "px";
      const dCtx = display.getContext("2d")!;
      dCtx.imageSmoothingEnabled = false;
      dCtx.drawImage(tile.canvas, 0, 0, display.width, display.height);
      wrap.appendChild(display);

      // Click → add to selected row
      wrap.addEventListener("click", () => {
        this.addTileToSelectedRow(tile);
      });

      // Drag start → for drag-to-row
      wrap.draggable = true;
      wrap.addEventListener("dragstart", (e) => {
        e.dataTransfer!.setData("text/plain", tile.id);
        e.dataTransfer!.effectAllowed = "copy";
      });

      this.tileGridEl.appendChild(wrap);
    });
  }

  // ==== Animation Rows ===============================================

  private addRow() {
    this.rows.push({
      name: `row${this.rows.length}`,
      frames: [],
    });
    this.selectedRowIdx = this.rows.length - 1;
  }

  private addTileToSelectedRow(tile: Tile) {
    const row = this.rows[this.selectedRowIdx];
    if (!row) return;
    // Clone tile so it can appear multiple times
    row.frames.push({ ...tile, id: `${tile.id}_${Date.now()}` });
    this.renderRows();
    this.startPreview();
    this.updateExportInfo();
  }

  private renderRows() {
    this.rowsWrapEl.innerHTML = "";

    if (this.rows.length === 0) {
      const empty = el("div", "st-empty-state");
      empty.innerHTML = `<div class="st-empty-icon">📋</div>No animation rows yet`;
      this.rowsWrapEl.appendChild(empty);
      return;
    }

    this.rows.forEach((row, rowIdx) => {
      const rowEl = el("div", "st-row");
      if (rowIdx === this.selectedRowIdx) {
        rowEl.style.borderColor = "var(--st-accent)";
      }

      // header
      const header = el("div", "st-row-header");
      const nameInput = document.createElement("input");
      nameInput.className = "st-row-name";
      nameInput.value = row.name;
      nameInput.addEventListener("input", () => {
        row.name = nameInput.value;
      });
      header.appendChild(nameInput);

      const selectBtn = elText("button", rowIdx === this.selectedRowIdx ? "✓ Selected" : "Select", "st-btn") as HTMLButtonElement;
      if (rowIdx === this.selectedRowIdx) selectBtn.classList.add("accent");
      selectBtn.addEventListener("click", () => {
        this.selectedRowIdx = rowIdx;
        this.previewFrame = 0;
        this.renderRows();
        this.startPreview();
      });
      header.appendChild(selectBtn);

      const dupeBtn = elText("button", "Dupe", "st-btn") as HTMLButtonElement;
      dupeBtn.addEventListener("click", () => {
        this.rows.splice(rowIdx + 1, 0, {
          name: row.name + "_copy",
          frames: row.frames.map((f) => ({ ...f, id: `${f.id}_d${Date.now()}` })),
        });
        this.renderRows();
        this.updateExportInfo();
      });
      header.appendChild(dupeBtn);

      const delBtn = elText("button", "✕", "st-btn danger") as HTMLButtonElement;
      delBtn.addEventListener("click", () => {
        this.rows.splice(rowIdx, 1);
        if (this.selectedRowIdx >= this.rows.length) {
          this.selectedRowIdx = Math.max(0, this.rows.length - 1);
        }
        this.renderRows();
        this.startPreview();
        this.updateExportInfo();
      });
      header.appendChild(delBtn);

      rowEl.appendChild(header);

      // frames area
      const framesEl = el("div", "st-row-frames") as HTMLDivElement;

      // Accept drops from tile grid
      framesEl.addEventListener("dragover", (e) => {
        e.preventDefault();
        framesEl.classList.add("drag-over");
      });
      framesEl.addEventListener("dragleave", () => framesEl.classList.remove("drag-over"));
      framesEl.addEventListener("drop", (e) => {
        e.preventDefault();
        framesEl.classList.remove("drag-over");
        const tileId = e.dataTransfer!.getData("text/plain");

        // Check if this is a reorder within the row (frameIdx prefix)
        if (tileId.startsWith("frame:")) {
          const parts = tileId.split(":");
          const srcRowIdx = parseInt(parts[1]);
          const srcFrameIdx = parseInt(parts[2]);
          if (srcRowIdx === rowIdx) {
            // Reorder within the same row: move to end
            const [moved] = this.rows[srcRowIdx].frames.splice(srcFrameIdx, 1);
            this.rows[rowIdx].frames.push(moved);
          } else {
            // Move between rows
            const [moved] = this.rows[srcRowIdx].frames.splice(srcFrameIdx, 1);
            this.rows[rowIdx].frames.push(moved);
          }
        } else {
          // From tile grid
          const tile = this.tiles.find((t) => t.id === tileId);
          if (tile) {
            row.frames.push({ ...tile, id: `${tile.id}_${Date.now()}` });
          }
        }
        this.renderRows();
        this.startPreview();
        this.updateExportInfo();
      });

      if (row.frames.length === 0) {
        framesEl.appendChild(elText("div", "Click or drag tiles here to add frames", "st-row-empty"));
      }

      row.frames.forEach((frame, frameIdx) => {
        const frameEl = el("div", "st-row-frame");
        const display = document.createElement("canvas");
        const scale = 40 / Math.max(frame.srcW, frame.srcH);
        display.width = Math.round(frame.srcW * scale);
        display.height = Math.round(frame.srcH * scale);
        display.style.width = display.width + "px";
        display.style.height = display.height + "px";
        const dCtx = display.getContext("2d")!;
        dCtx.imageSmoothingEnabled = false;
        dCtx.drawImage(frame.canvas, 0, 0, display.width, display.height);
        frameEl.appendChild(display);

        // Drag for reorder
        frameEl.draggable = true;
        frameEl.addEventListener("dragstart", (e) => {
          e.dataTransfer!.setData("text/plain", `frame:${rowIdx}:${frameIdx}`);
          e.dataTransfer!.effectAllowed = "move";
        });

        // Remove button
        const removeBtn = document.createElement("button");
        removeBtn.className = "st-row-frame-remove";
        removeBtn.textContent = "✕";
        removeBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          row.frames.splice(frameIdx, 1);
          this.renderRows();
          this.startPreview();
          this.updateExportInfo();
        });
        frameEl.appendChild(removeBtn);

        framesEl.appendChild(frameEl);
      });

      rowEl.appendChild(framesEl);
      this.rowsWrapEl.appendChild(rowEl);
    });
  }

  // ==== Preview ======================================================

  private startPreview() {
    if (this.previewTimer) clearInterval(this.previewTimer);
    this.previewFrame = 0;
    const interval = Math.max(30, Math.round(1000 / this.previewFps));
    this.previewTimer = window.setInterval(() => this.renderPreview(), interval);
  }

  private renderPreview() {
    const ctx = this.previewCtx;
    const cw = this.previewCanvas.width;
    const ch = this.previewCanvas.height;
    ctx.clearRect(0, 0, cw, ch);

    const row = this.rows[this.selectedRowIdx];
    if (!row || row.frames.length === 0) return;

    const frame = row.frames[this.previewFrame % row.frames.length];
    if (!frame) return;

    // Use the target output frame size for preview proportions
    const { fw, fh } = this.getOutputFrameSize();
    const scaleX = cw / fw;
    const scaleY = ch / fh;
    const scale = Math.min(scaleX, scaleY);
    const dw = Math.round(fw * scale);
    const dh = Math.round(fh * scale);
    const dx = Math.round((cw - dw) / 2);
    const dy = Math.round((ch - dh) / 2);

    // Draw source frame scaled to the target output size within the preview
    ctx.drawImage(frame.canvas, 0, 0, frame.srcW, frame.srcH, dx, dy, dw, dh);
    this.previewFrame = (this.previewFrame + 1) % row.frames.length;
  }

  // ==== Output frame size helper ======================================

  /** Returns the effective output frame w/h, falling back to the first frame's source size */
  private getOutputFrameSize(): { fw: number; fh: number } {
    const nonEmpty = this.rows.filter((r) => r.frames.length > 0);
    const first = nonEmpty[0]?.frames[0];
    const srcW = first?.srcW ?? 32;
    const srcH = first?.srcH ?? 32;
    return {
      fw: this.targetFrameW > 0 ? this.targetFrameW : srcW,
      fh: this.targetFrameH > 0 ? this.targetFrameH : srcH,
    };
  }

  // ==== Export Info ===================================================

  private updateExportInfo() {
    const totalFrames = this.rows.reduce((sum, r) => sum + r.frames.length, 0);
    const nonEmpty = this.rows.filter((r) => r.frames.length > 0);
    const name = this.filenameInput?.value || "spritesheet";

    if (totalFrames === 0) {
      this.exportInfoEl.textContent = "Add frames to rows to enable export.";
      return;
    }

    const { fw, fh } = this.getOutputFrameSize();
    const maxCols = Math.max(...nonEmpty.map((r) => r.frames.length));

    const firstSrc = nonEmpty[0]?.frames[0];
    const resizing = firstSrc && (fw !== firstSrc.srcW || fh !== firstSrc.srcH);

    this.exportInfoEl.textContent =
      `${nonEmpty.length} row(s), ${totalFrames} frame(s)\n` +
      `Output frame: ${fw}×${fh}${resizing ? ` (resized from ${firstSrc.srcW}×${firstSrc.srcH})` : ""}\n` +
      `Sheet: ${maxCols * fw}×${nonEmpty.length * fh}\n` +
      `Files: ${name}.png + ${name}.json`;
  }

  // ==== Export ========================================================

  private doExport() {
    const nonEmpty = this.rows.filter((r) => r.frames.length > 0);
    if (nonEmpty.length === 0) {
      alert("No frames to export. Add tiles to at least one row.");
      return;
    }

    const name = this.filenameInput.value.trim() || "spritesheet";

    // Determine output frame dimensions (may differ from source)
    const { fw, fh } = this.getOutputFrameSize();
    const maxCols = Math.max(...nonEmpty.map((r) => r.frames.length));

    const outW = maxCols * fw;
    const outH = nonEmpty.length * fh;

    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;

    // Build frames map and animations map
    const framesMap: Record<string, unknown> = {};
    const animationsMap: Record<string, string[]> = {};

    nonEmpty.forEach((row, rowIdx) => {
      const animKeys: string[] = [];
      row.frames.forEach((frame, colIdx) => {
        const key = `tile${rowIdx}_${colIdx}`;
        const x = colIdx * fw;
        const y = rowIdx * fh;

        // Draw onto output canvas
        ctx.drawImage(frame.canvas, 0, 0, frame.srcW, frame.srcH, x, y, fw, fh);

        framesMap[key] = {
          frame: { x, y, w: fw, h: fh },
          rotated: false,
          trimmed: true,
          spriteSourceSize: { x: 0, y: 0, w: fw, h: fh },
          sourceSize: { w: fw, h: fh },
        };
        animKeys.push(key);
      });
      animationsMap[row.name] = animKeys;
    });

    const json = {
      frames: framesMap,
      animations: animationsMap,
      meta: {
        image: `${name}.png`,
        format: "RGBA8888",
        scale: "1",
      },
    };

    // Download PNG
    canvas.toBlob((blob) => {
      if (!blob) return;
      downloadBlob(blob, `${name}.png`);
    }, "image/png");

    // Download JSON
    const jsonStr = JSON.stringify(json, null, 2);
    downloadBlob(new Blob([jsonStr], { type: "application/json" }), `${name}.json`);
  }
}

// ==== Helpers ========================================================

function el(tag: string, className?: string): HTMLElement {
  const e = document.createElement(tag);
  if (className) e.className = className;
  return e;
}

function elText(tag: string, text: string, className?: string): HTMLElement {
  const e = el(tag, className);
  e.textContent = text;
  return e;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

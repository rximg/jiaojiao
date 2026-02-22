export type RatioClass = '4:3' | 'other' | 'unknown';
export type PrintFitMode = 'contain' | 'stretch';
export type PrintOrientation = 'portrait' | 'landscape';
export type PerPage = 1 | 2 | 4 | 6 | 9;

export interface PrintableImage {
  name: string;
  path: string;
  ratioClass: RatioClass;
}

export interface PrintLayoutConfig {
  orientation: PrintOrientation;
  perPage: PerPage;
  fitMode: PrintFitMode;
  marginTopMm: number;
  marginRightMm: number;
  marginBottomMm: number;
  marginLeftMm: number;
  gapMm: number;
}

export interface PrintCell {
  row: number;
  col: number;
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
  image?: PrintableImage;
}

export interface PrintPage {
  index: number;
  rows: number;
  cols: number;
  paperWidthMm: number;
  paperHeightMm: number;
  cells: PrintCell[];
}

export const DEFAULT_PRINT_LAYOUT: PrintLayoutConfig = {
  orientation: 'portrait',
  perPage: 4,
  fitMode: 'contain',
  marginTopMm: 10,
  marginRightMm: 10,
  marginBottomMm: 10,
  marginLeftMm: 10,
  gapMm: 5,
};

export function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.max(min, Math.min(max, value));
}

export function getPaperSizeMm(orientation: PrintOrientation): { widthMm: number; heightMm: number } {
  if (orientation === 'landscape') {
    return { widthMm: 297, heightMm: 210 };
  }
  return { widthMm: 210, heightMm: 297 };
}

export function getGrid(orientation: PrintOrientation, perPage: PerPage): { rows: number; cols: number } {
  if (perPage === 1) return { rows: 1, cols: 1 };
  if (perPage === 2) {
    return orientation === 'portrait' ? { rows: 2, cols: 1 } : { rows: 1, cols: 2 };
  }
  if (perPage === 4) return { rows: 2, cols: 2 };
  if (perPage === 6) {
    return orientation === 'portrait' ? { rows: 3, cols: 2 } : { rows: 2, cols: 3 };
  }
  return { rows: 3, cols: 3 };
}

export function normalizeLayoutConfig(config: PrintLayoutConfig): PrintLayoutConfig {
  return {
    ...config,
    marginTopMm: clamp(config.marginTopMm, 0, 20),
    marginRightMm: clamp(config.marginRightMm, 0, 20),
    marginBottomMm: clamp(config.marginBottomMm, 0, 20),
    marginLeftMm: clamp(config.marginLeftMm, 0, 20),
    gapMm: clamp(config.gapMm, 2, 10),
  };
}

export function computePrintPages(
  images: PrintableImage[],
  rawConfig: PrintLayoutConfig
): PrintPage[] {
  const config = normalizeLayoutConfig(rawConfig);
  const { widthMm: paperWidthMm, heightMm: paperHeightMm } = getPaperSizeMm(config.orientation);
  const { rows, cols } = getGrid(config.orientation, config.perPage);
  const usableWidthMm = paperWidthMm - config.marginLeftMm - config.marginRightMm;
  const usableHeightMm = paperHeightMm - config.marginTopMm - config.marginBottomMm;

  if (usableWidthMm <= 0 || usableHeightMm <= 0) return [];

  const cellWidthMm = (usableWidthMm - (cols - 1) * config.gapMm) / cols;
  const cellHeightMm = (usableHeightMm - (rows - 1) * config.gapMm) / rows;

  if (cellWidthMm <= 0 || cellHeightMm <= 0) return [];

  const perPage = rows * cols;
  const pageCount = Math.ceil(images.length / perPage);
  const pages: PrintPage[] = [];

  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    const cells: PrintCell[] = [];
    for (let slot = 0; slot < perPage; slot += 1) {
      const row = Math.floor(slot / cols);
      const col = slot % cols;
      const imageIndex = pageIndex * perPage + slot;
      const image = imageIndex < images.length ? images[imageIndex] : undefined;
      cells.push({
        row,
        col,
        xMm: config.marginLeftMm + col * (cellWidthMm + config.gapMm),
        yMm: config.marginTopMm + row * (cellHeightMm + config.gapMm),
        widthMm: cellWidthMm,
        heightMm: cellHeightMm,
        image,
      });
    }
    pages.push({
      index: pageIndex,
      rows,
      cols,
      paperWidthMm,
      paperHeightMm,
      cells,
    });
  }

  return pages;
}

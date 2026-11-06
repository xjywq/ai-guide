/* 轻量图表：折线图（含对数坐标、悬停提示）、横向对比条、数字滚动。
   不依赖任何外部库，配置写在每个图表容器内的 <script type="application/json"> 中。 */

const SVG_NS = "http://www.w3.org/2000/svg";
const SERIES_COLORS = { "series-1": "#2a78d6", "series-2": "#eb6834", baseline: "#b9c3d1" };
const LINE_DRAW_MS = 1600;
const COUNT_UP_MS = 1400;
const CHART_WIDTH = 640;
const MIN_CHART_WIDTH = 300;
const NARROW_CHART_WIDTH = 480;
const NARROW_RIGHT_MARGIN = 48;
const MIN_X_TICK_SPACING_PX = 48;
const CHART_HEIGHT = 300;
const MARGIN = { top: 18, right: 120, bottom: 30, left: 58 };
const HOVER_RADIUS_PX = 40;

function svgEl(tag, attrs = {}, parent) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  if (parent) parent.appendChild(node);
  return node;
}

/** "2024-08" 或 "2024-08-20" 转为带小数的年份，便于在时间轴上定位 */
function toFractionalYear(dateText) {
  const [year, month = 1, day = 1] = dateText.split("-").map(Number);
  return year + (month - 1) / 12 + (day - 1) / 365;
}

function formatValue(value, format = {}) {
  const decimals = format.decimals ?? 0;
  const text = value.toLocaleString("zh-CN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return `${format.prefix ?? ""}${text}${format.suffix ?? ""}`;
}

function easeOutCubic(progress) {
  return 1 - Math.pow(1 - progress, 3);
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/* ---------------- 折线图 ---------------- */
function renderLineChart(container, config) {
  // 让 SVG 坐标单位等于屏幕像素，文字不会因缩放变得过小
  const width = config.width ?? Math.max(MIN_CHART_WIDTH, container.clientWidth || CHART_WIDTH);
  const height = config.height ?? CHART_HEIGHT;
  // 窄屏（手机）上收窄右侧留白，把空间让给绘图区
  const baseMargin = width < NARROW_CHART_WIDTH ? { ...MARGIN, right: NARROW_RIGHT_MARGIN } : MARGIN;
  const margin = { ...baseMargin, ...(width < NARROW_CHART_WIDTH ? {} : config.margin ?? {}) };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;

  const allPoints = config.series.flatMap((series) => series.points);
  const xValues = allPoints.map((point) => toFractionalYear(point[0]));
  const xMin = config.xMin ?? Math.floor(Math.min(...xValues));
  const xMax = config.xMax ?? Math.max(...xValues);
  const yValues = allPoints.map((point) => point[1]);
  const yMin = config.yMin ?? (config.yLog ? Math.min(...yValues) : 0);
  const yMax = config.yMax ?? Math.max(...yValues) * 1.08;

  const scaleX = (year) => margin.left + ((year - xMin) / (xMax - xMin)) * plotWidth;
  const scaleY = config.yLog
    ? (value) => margin.top + plotHeight - ((Math.log10(value) - Math.log10(yMin)) / (Math.log10(yMax) - Math.log10(yMin))) * plotHeight
    : (value) => margin.top + plotHeight - ((value - yMin) / (yMax - yMin)) * plotHeight;

  if (config.title) {
    const title = document.createElement("div");
    title.className = "chart-title";
    title.textContent = config.title;
    container.appendChild(title);
  }
  if (config.series.length > 1) {
    const legend = document.createElement("div");
    legend.className = "chart-legend";
    for (const series of config.series) {
      const color = SERIES_COLORS[series.color] ?? series.color;
      const item = document.createElement("span");
      item.innerHTML = `<i class="${series.dashed ? "dashed" : ""}" style="background:${color};color:${color}"></i>${series.name}`;
      legend.appendChild(item);
    }
    container.appendChild(legend);
  }

  const svg = svgEl("svg", { viewBox: `0 0 ${width} ${height}`, role: "img", "aria-label": config.ariaLabel ?? config.title ?? "折线图" });
  container.appendChild(svg);

  // 纵轴刻度
  const yTicks = config.yTicks ?? buildLinearTicks(yMin, yMax, config.format);
  const gridGroup = svgEl("g", { class: "tick" }, svg);
  for (const tick of yTicks) {
    const y = scaleY(tick.value);
    svgEl("line", { class: "grid-line", x1: margin.left, x2: margin.left + plotWidth, y1: y, y2: y }, gridGroup);
    const label = svgEl("text", { x: margin.left - 8, y: y + 4, "text-anchor": "end" }, gridGroup);
    label.textContent = tick.label;
  }
  // 横轴（按年）
  svgEl("line", { class: "baseline-line", x1: margin.left, x2: margin.left + plotWidth, y1: margin.top + plotHeight, y2: margin.top + plotHeight }, svg);
  const xAxis = svgEl("g", { class: "axis" }, svg);
  const allTickYears = config.xTicks ?? range(Math.ceil(xMin), Math.floor(xMax));
  // 年份刻度太密时隔一个显示，保留最后一年
  const tickStride = Math.max(1, Math.ceil((allTickYears.length * MIN_X_TICK_SPACING_PX) / plotWidth));
  const xTickYears = allTickYears.filter((_, index) => (allTickYears.length - 1 - index) % tickStride === 0);
  for (const year of xTickYears) {
    const label = svgEl("text", { x: scaleX(year), y: height - 8, "text-anchor": "middle" }, xAxis);
    label.textContent = String(year);
  }

  // 逐步显示：用裁剪矩形从左往右展开
  const clipId = `clip-${Math.random().toString(36).slice(2, 9)}`;
  const clipPath = svgEl("clipPath", { id: clipId }, svgEl("defs", {}, svg));
  const clipRect = svgEl("rect", { x: 0, y: 0, width: 0, height }, clipPath);
  const plotGroup = svgEl("g", { "clip-path": `url(#${clipId})` }, svg);

  const hoverPoints = [];
  config.series.forEach((series) => {
    const color = SERIES_COLORS[series.color] ?? series.color;
    const coords = series.points.map((point) => [scaleX(toFractionalYear(point[0])), scaleY(point[1])]);
    const pathData = coords.map(([x, y], index) => `${index ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
    if (config.area && !series.dashed) {
      const baseY = margin.top + plotHeight;
      const areaData = `${pathData} L${coords.at(-1)[0].toFixed(1)},${baseY} L${coords[0][0].toFixed(1)},${baseY} Z`;
      svgEl("path", { d: areaData, fill: color, class: "series-area" }, plotGroup);
    }
    svgEl("path", { d: pathData, stroke: color, class: "series-line", "stroke-dasharray": series.dashed ? "6 5" : "none" }, plotGroup);
    series.points.forEach((point, index) => {
      const [x, y] = coords[index];
      svgEl("circle", { cx: x, cy: y, r: 4.5, fill: color, class: "dot" }, plotGroup);
      hoverPoints.push({ x, y, date: point[0], value: point[1], display: point[2], seriesName: series.name, color, format: series.format ?? config.format });
    });
    // 窄屏右侧空间不够，系列名称由图例承担
    if (series.endLabel && width >= NARROW_CHART_WIDTH) {
      const [lastX, lastY] = coords.at(-1);
      const label = svgEl("text", { x: lastX + 10, y: lastY + 4, class: "series-label" }, plotGroup);
      label.textContent = series.endLabel;
    }
  });

  // 标注
  for (const annotation of config.annotations ?? []) {
    const series = config.series[annotation.series ?? 0];
    const point = series.points[annotation.point];
    const x = scaleX(toFractionalYear(point[0]));
    const y = scaleY(point[1]);
    const textX = x + (annotation.dx ?? 0);
    const textY = y + (annotation.dy ?? -18);
    const group = svgEl("g", { class: "anno" }, plotGroup);
    svgEl("line", { x1: x, y1: y, x2: textX, y2: textY + 4 }, group);
    const anchor = annotation.anchor ?? "middle";
    const main = svgEl("text", { x: textX, y: textY - (annotation.sub ? 14 : 0), "text-anchor": anchor }, group);
    main.textContent = annotation.text;
    if (annotation.sub) {
      const sub = svgEl("text", { x: textX, y: textY, "text-anchor": anchor, class: "anno-sub" }, group);
      sub.textContent = annotation.sub;
    }
  }

  attachLineHover(container, svg, hoverPoints, { width, height, margin, plotHeight });

  const fullWidth = width;
  return function draw() {
    if (prefersReducedMotion()) {
      clipRect.setAttribute("width", fullWidth);
      return;
    }
    const start = performance.now();
    const step = (now) => {
      const progress = Math.min(1, (now - start) / LINE_DRAW_MS);
      clipRect.setAttribute("width", (easeOutCubic(progress) * fullWidth).toFixed(1));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
}

function range(from, to) {
  const values = [];
  for (let value = from; value <= to; value += 1) values.push(value);
  return values;
}

function buildLinearTicks(minValue, maxValue, format) {
  const TARGET_TICK_COUNT = 4;
  const rawStep = (maxValue - minValue) / TARGET_TICK_COUNT;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const niceStep = [1, 2, 2.5, 5, 10].map((multiplier) => multiplier * magnitude).find((candidate) => candidate >= rawStep);
  const ticks = [];
  for (let value = Math.ceil(minValue / niceStep) * niceStep; value <= maxValue; value += niceStep) {
    ticks.push({ value, label: formatValue(value, { ...format, decimals: 0 }) });
  }
  return ticks;
}

function attachLineHover(container, svg, hoverPoints, layout) {
  const tooltip = document.createElement("div");
  tooltip.className = "tooltip";
  container.appendChild(tooltip);
  const crosshair = svgEl("line", { class: "crosshair", y1: layout.margin.top, y2: layout.margin.top + layout.plotHeight, opacity: 0 }, svg);
  const overlay = svgEl("rect", { x: 0, y: 0, width: layout.width, height: layout.height, fill: "transparent" }, svg);

  const hide = () => {
    tooltip.classList.remove("show");
    crosshair.setAttribute("opacity", 0);
  };
  overlay.addEventListener("pointermove", (event) => {
    const bounds = svg.getBoundingClientRect();
    const scale = layout.width / bounds.width;
    const pointerX = (event.clientX - bounds.left) * scale;
    const pointerY = (event.clientY - bounds.top) * scale;
    let nearest = null;
    let nearestDistance = Infinity;
    for (const point of hoverPoints) {
      const distance = Math.hypot(point.x - pointerX, (point.y - pointerY) * 0.35);
      if (distance < nearestDistance) {
        nearest = point;
        nearestDistance = distance;
      }
    }
    if (!nearest || nearestDistance > HOVER_RADIUS_PX * scale * 2) return hide();
    crosshair.setAttribute("x1", nearest.x);
    crosshair.setAttribute("x2", nearest.x);
    crosshair.setAttribute("opacity", 1);
    const valueText = nearest.display ?? formatValue(nearest.value, nearest.format);
    tooltip.innerHTML = `<div class="tt-date">${nearest.date}</div><div><span style="color:${nearest.color}">●</span> ${nearest.seriesName}：<b>${valueText}</b></div>`;
    tooltip.style.left = `${nearest.x / scale}px`;
    tooltip.style.top = `${nearest.y / scale + svg.offsetTop}px`;
    tooltip.classList.add("show");
  });
  overlay.addEventListener("pointerleave", hide);
}

/* ---------------- 横向对比条 ---------------- */
function renderBars(container, config) {
  const values = config.items.map((item) => item.value);
  const negativeSpan = Math.max(0, -Math.min(0, ...values));
  const positiveSpan = config.max ?? Math.max(0, ...values);
  const totalSpan = positiveSpan + negativeSpan;
  const zeroPercent = (negativeSpan / totalSpan) * 100;
  // 留出右侧放数值标签的空间
  const usablePercent = config.usable ?? 78;

  const wrapper = document.createElement("div");
  wrapper.className = "bars";
  if (config.title) {
    const title = document.createElement("div");
    title.className = "chart-title";
    title.textContent = config.title;
    container.appendChild(title);
  }
  const fills = [];
  for (const item of config.items) {
    const row = document.createElement("div");
    row.className = "bar-row";
    row.innerHTML = `<div class="bar-label">${item.label}${item.sub ? `<small>${item.sub}</small>` : ""}</div>`;
    const track = document.createElement("div");
    track.className = "bar-track";
    track.title = `${item.label}：${item.display ?? item.value}`;
    const fill = document.createElement("div");
    const isNegative = item.value < 0;
    fill.className = `bar-fill${item.hi ? " hi" : ""}${isNegative ? " neg" : ""}`;
    const lengthPercent = (Math.abs(item.value) / totalSpan) * usablePercent;
    const zeroOffset = zeroPercent * (usablePercent / 100);
    const valueLabel = document.createElement("span");
    valueLabel.className = "bar-value";
    valueLabel.textContent = item.display ?? String(item.value);
    if (isNegative) {
      // 负值向左画，数值标签放在零线右侧，避免压到左边的标签列
      fill.style.left = "auto";
      fill.style.right = `${100 - zeroOffset}%`;
      valueLabel.style.left = `calc(${zeroOffset}% + 8px)`;
    } else {
      fill.style.left = `${zeroOffset}%`;
      valueLabel.style.left = `calc(${zeroOffset + Math.max(lengthPercent, 0.4)}% + 8px)`;
    }
    track.appendChild(fill);
    track.appendChild(valueLabel);
    if (negativeSpan > 0) {
      const zeroLine = document.createElement("i");
      zeroLine.className = "bar-zero";
      zeroLine.style.left = `${zeroOffset}%`;
      track.appendChild(zeroLine);
    }
    row.appendChild(track);
    wrapper.appendChild(row);
    fills.push({ fill, lengthPercent: Math.max(lengthPercent, item.value === 0 ? 0 : 0.4) });
  }
  container.appendChild(wrapper);

  return function draw() {
    fills.forEach(({ fill, lengthPercent }) => {
      fill.style.width = `${lengthPercent}%`;
    });
    wrapper.classList.add("is-drawn");
  };
}

/* ---------------- 文件页数阵列 ---------------- */
function renderPages(container, config) {
  const grid = document.createElement("div");
  grid.className = "pages-grid";
  for (let index = 0; index < config.total; index += 1) {
    const page = document.createElement("i");
    if (index < config.highlight) page.className = "on";
    page.style.transitionDelay = `${Math.min(index * 4, 900)}ms`;
    grid.appendChild(page);
  }
  container.appendChild(grid);
  return () => {};
}

/* ---------------- 数字滚动 ---------------- */
function prepareCountUp(element) {
  const target = Number(element.dataset.to);
  const decimals = Number(element.dataset.decimals ?? 0);
  const render = (value) => {
    element.textContent = value.toLocaleString("zh-CN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  };
  if (prefersReducedMotion()) {
    render(target);
    return () => {};
  }
  render(0);
  return function run() {
    const start = performance.now();
    const step = (now) => {
      const progress = Math.min(1, (now - start) / COUNT_UP_MS);
      render(target * easeOutCubic(progress));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
}

const CHART_RENDERERS = { line: renderLineChart, bars: renderBars, pages: renderPages };

/** 初始化容器内的所有图表，返回在幻灯片进入视口时调用的绘制函数列表。
    不用 ES module，保证直接双击打开 index.html（file://）也能运行。 */
window.initCharts = function initCharts(root) {
  const drawFunctions = [];
  for (const container of root.querySelectorAll(".chart[data-chart]")) {
    const configNode = container.querySelector('script[type="application/json"]');
    const config = JSON.parse(configNode.textContent);
    const renderer = CHART_RENDERERS[container.dataset.chart];
    drawFunctions.push(renderer(container, config));
  }
  for (const element of root.querySelectorAll(".count[data-to]")) {
    drawFunctions.push(prepareCountUp(element));
  }
  return drawFunctions;
};

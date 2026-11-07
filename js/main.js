/* 幻灯片式页面：生成左侧目录、跟踪当前页、键盘翻页、进场动画。 */
(function setupSlides() {
  const MOBILE_BREAKPOINT_PX = 900;
  /* 页面顶部进入视口下方 80% 处即开始进场；用边距而不是可见比例，手机上很长的页也能触发 */
  const REVEAL_ROOT_MARGIN = "0px 0px -20% 0px";
  const NEXT_KEYS = new Set(["ArrowDown", "PageDown", " "]);
  const PREV_KEYS = new Set(["ArrowUp", "PageUp"]);

  const slides = Array.from(document.querySelectorAll(".slide"));
  const totalSlides = slides.length;
  const tocList = document.querySelector(".toc-list");
  const tocScroll = document.querySelector(".toc-scroll");
  const progressFill = document.querySelector(".toc-progress-fill");
  const progressText = document.querySelector(".toc-progress-text");
  const topbarTitle = document.querySelector(".topbar-title");
  const topbarCount = document.querySelector(".topbar-count");
  const topbarProgress = document.querySelector(".topbar-progress");

  const pad = (value) => String(value).padStart(2, "0");

  /* ---------- 目录 ---------- */
  const chapters = [];
  slides.forEach((slide, index) => {
    const chapterName = slide.dataset.chapter;
    let chapter = chapters.at(-1);
    if (!chapter || chapter.name !== chapterName) {
      chapter = { name: chapterName, slides: [] };
      chapters.push(chapter);
    }
    chapter.slides.push({ slide, index });
  });

  /* 竖向轨道：每个章节是轨道上的一个节点，读到哪里，轨道就亮到哪里。
     同一阶段（data-phase）的章节归在一个小标题下；多页的章节可以展开或收起。 */
  const slideLinks = new Map();
  const chapterItems = [];
  const rail = document.createElement("li");
  rail.className = "toc-rail";
  rail.setAttribute("aria-hidden", "true");
  rail.innerHTML = "<i></i>";
  const railFill = rail.firstElementChild;
  tocList.appendChild(rail);

  const slideLabel = (slide) =>
    slide.dataset.kind ? `<i class="toc-kind">${slide.dataset.kind}</i>${slide.dataset.title}` : slide.dataset.title;

  let previousPhase = "";
  chapters.forEach((chapter) => {
    const firstSlide = chapter.slides[0].slide;
    const phase = firstSlide.dataset.phase ?? "";
    if (phase && phase !== previousPhase) {
      const phaseItem = document.createElement("li");
      phaseItem.className = "toc-phase";
      phaseItem.textContent = phase;
      tocList.appendChild(phaseItem);
    }
    previousPhase = phase;

    const item = document.createElement("li");
    item.className = phase ? "toc-chapter in-phase" : "toc-chapter";
    const hasPages = chapter.slides.length > 1;
    item.innerHTML =
      `<div class="toc-row"><a class="toc-node" href="#${firstSlide.id}">${chapter.name}</a>` +
      (hasPages ? `<button type="button" class="toc-fold" aria-expanded="false" aria-label="展开或收起：${chapter.name}"></button>` : "") +
      "</div>";
    if (hasPages) {
      const wrap = document.createElement("div");
      wrap.className = "toc-slides-wrap";
      const subList = document.createElement("ol");
      subList.className = "toc-slides";
      chapter.slides.forEach(({ slide }) => {
        const subItem = document.createElement("li");
        subItem.innerHTML = `<a href="#${slide.id}">${slideLabel(slide)}</a>`;
        subList.appendChild(subItem);
        slideLinks.set(slide, subItem.firstElementChild);
      });
      wrap.appendChild(subList);
      item.appendChild(wrap);
      item.querySelector(".toc-fold").addEventListener("click", () => {
        const expanded = !item.classList.contains("is-expanded");
        setExpanded(item, expanded);
        /* 手动展开的章节会一直开着，直到手动收起 */
        item.classList.toggle("is-pinned", expanded);
      });
    } else {
      slideLinks.set(firstSlide, item.querySelector(".toc-node"));
    }
    tocList.appendChild(item);
    chapterItems.push({ item, chapter });
  });

  function setExpanded(item, expanded) {
    const fold = item.querySelector(".toc-fold");
    if (!fold) return;
    item.classList.toggle("is-expanded", expanded);
    fold.setAttribute("aria-expanded", String(expanded));
  }

  /* 轨道亮到当前章节节点的位置；展开收起有过渡动画，结束后再量一次 */
  let activeItem = null;
  function updateRail() {
    if (!activeItem) return;
    const node = activeItem.querySelector(".toc-node");
    const nodeBox = node.getBoundingClientRect();
    railFill.style.height = `${nodeBox.top - rail.getBoundingClientRect().top + nodeBox.height / 2}px`;
  }
  window.addEventListener("resize", updateRail);
  tocList.addEventListener("transitionend", (event) => {
    if (event.target.classList.contains("toc-slides-wrap")) updateRail();
  });

  function keepInView(element) {
    const listBox = tocScroll.getBoundingClientRect();
    const box = element.getBoundingClientRect();
    if (box.top < listBox.top) tocScroll.scrollTop -= listBox.top - box.top + 12;
    else if (box.bottom > listBox.bottom) tocScroll.scrollTop += box.bottom - listBox.bottom + 12;
  }

  /* ---------- 原理页：一键展开或收起全部细节 ---------- */
  document.querySelectorAll(".expand-all").forEach((button) => {
    const panels = Array.from(button.closest(".slide").querySelectorAll("details.more"));
    const syncLabel = () => {
      const allOpen = panels.every((panel) => panel.open);
      button.textContent = allOpen ? "全部收起" : "全部展开";
      button.setAttribute("aria-expanded", String(allOpen));
    };
    button.addEventListener("click", () => {
      const openAll = !panels.every((panel) => panel.open);
      panels.forEach((panel) => { panel.open = openAll; });
      syncLabel();
    });
    panels.forEach((panel) => panel.addEventListener("toggle", syncLabel));
    syncLabel();
  });

  /* ---------- 页码 ---------- */
  slides.forEach((slide, index) => {
    const meta = document.createElement("div");
    meta.className = "slide-meta";
    meta.innerHTML = `<b>${slide.dataset.chapter}</b> · ${pad(index + 1)} / ${pad(totalSlides)}`;
    slide.appendChild(meta);
  });

  /* ---------- 当前页 ---------- */
  let activeIndex = 0;
  function setActive(index) {
    activeIndex = index;
    const slide = slides[index];
    slideLinks.forEach((link, linkedSlide) => link.classList.toggle("is-active", linkedSlide === slide));
    let reachedActive = false;
    chapterItems.forEach(({ item, chapter }) => {
      const isActive = chapter.slides.some((entry) => entry.slide === slide);
      if (isActive && item !== activeItem) {
        if (activeItem && !activeItem.classList.contains("is-pinned")) setExpanded(activeItem, false);
        setExpanded(item, true);
        activeItem = item;
      }
      item.classList.toggle("is-active", isActive);
      if (isActive) reachedActive = true;
      item.classList.toggle("is-done", !reachedActive);
    });
    updateRail();
    const percent = ((index + 1) / totalSlides) * 100;
    progressFill.style.width = `${percent}%`;
    progressText.textContent = `${pad(index + 1)} / ${pad(totalSlides)}`;
    const kind = slide.dataset.kind ? `${slide.dataset.kind}：` : "";
    topbarTitle.textContent = `${slide.dataset.chapter} · ${kind}${slide.dataset.title}`;
    topbarCount.textContent = `${index + 1}/${totalSlides}`;
    topbarProgress.style.width = `${percent}%`;
    keepInView(slideLinks.get(slide));
  }

  const centerObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) setActive(slides.indexOf(entry.target));
      }
    },
    { rootMargin: "-45% 0px -50% 0px" }
  );
  slides.forEach((slide) => centerObserver.observe(slide));

  /* ---------- 进场动画与图表绘制 ---------- */
  const drawBySlide = new Map(slides.map((slide) => [slide, window.initCharts(slide)]));
  const revealObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const slide = entry.target;
        slide.classList.add("is-in");
        drawBySlide.get(slide).forEach((draw) => draw());
        revealObserver.unobserve(slide);
      }
    },
    { rootMargin: REVEAL_ROOT_MARGIN }
  );
  slides.forEach((slide) => revealObserver.observe(slide));

  /* ---------- 手机上横滑卡片的分页点 ---------- */
  document.querySelectorAll(".swipe").forEach((track) => {
    const cards = Array.from(track.children);
    const dots = document.createElement("div");
    dots.className = "swipe-dots";
    dots.setAttribute("aria-hidden", "true");
    dots.innerHTML = cards.map(() => "<i></i>").join("") + `<span>左右滑动 · ${cards.length} 个</span>`;
    track.after(dots);
    const dotItems = Array.from(dots.querySelectorAll("i"));
    const markCurrent = () => {
      const trackLeft = track.getBoundingClientRect().left;
      let current = 0;
      cards.forEach((card, index) => {
        if (card.getBoundingClientRect().left - trackLeft < card.offsetWidth / 2) current = index;
      });
      dotItems.forEach((dot, index) => dot.classList.toggle("on", index === current));
    };
    track.addEventListener("scroll", markCurrent, { passive: true });
    markCurrent();
  });

  /* ---------- 键盘翻页 ---------- */
  function goTo(index) {
    const target = slides[Math.max(0, Math.min(totalSlides - 1, index))];
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  document.addEventListener("keydown", (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (window.innerWidth <= MOBILE_BREAKPOINT_PX) return;
    /* 焦点在可展开细节或按钮上时，空格留给它们自己用 */
    if (event.key === " " && event.target.closest("summary, button")) return;
    if (NEXT_KEYS.has(event.key)) {
      event.preventDefault();
      goTo(activeIndex + 1);
    } else if (PREV_KEYS.has(event.key)) {
      event.preventDefault();
      goTo(activeIndex - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      goTo(0);
    } else if (event.key === "End") {
      event.preventDefault();
      goTo(totalSlides - 1);
    }
  });

  /* ---------- 移动端目录开关 ---------- */
  const tocToggle = document.querySelector(".topbar button");
  tocToggle.addEventListener("click", () => document.body.classList.toggle("toc-open"));
  tocList.addEventListener("click", (event) => {
    if (event.target.closest("a")) document.body.classList.remove("toc-open");
  });

  setActive(0);
})();

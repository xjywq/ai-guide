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

  const slideLinks = new Map();
  const chapterItems = [];
  let previousPart = "";
  chapters.forEach((chapter) => {
    /* 同属一个专题的章节（data-part）在目录里归到一个小标题下 */
    const part = chapter.slides[0].slide.dataset.part ?? "";
    if (part && part !== previousPart) {
      const partItem = document.createElement("li");
      partItem.className = "toc-part";
      partItem.textContent = part;
      tocList.appendChild(partItem);
    }
    previousPart = part;
    const item = document.createElement("li");
    item.className = part ? "toc-chapter in-part" : "toc-chapter";
    const firstSlideId = chapter.slides[0].slide.id;
    item.innerHTML = `<a href="#${firstSlideId}">${chapter.name}</a>`;
    const subList = document.createElement("ol");
    subList.className = "toc-slides";
    chapter.slides.forEach(({ slide }) => {
      const link = document.createElement("a");
      link.href = `#${slide.id}`;
      link.textContent = slide.dataset.title;
      const subItem = document.createElement("li");
      subItem.appendChild(link);
      subList.appendChild(subItem);
      slideLinks.set(slide, link);
    });
    item.appendChild(subList);
    tocList.appendChild(item);
    chapterItems.push({ item, chapter });
  });

  /* ---------- 航天专题路线条：每页顶部标出当前在哪个环节、哪一页 ---------- */
  const trailModules = chapters.filter((chapter) => chapter.slides[0].slide.dataset.phase);
  const trailPhases = [];
  trailModules.forEach((chapter) => {
    const phaseName = chapter.slides[0].slide.dataset.phase;
    let phase = trailPhases.at(-1);
    if (!phase || phase.name !== phaseName) {
      phase = { name: phaseName, modules: [] };
      trailPhases.push(phase);
    }
    phase.modules.push(chapter);
  });
  function buildTrail(currentSlide) {
    const nav = document.createElement("nav");
    nav.className = "trail";
    nav.setAttribute("aria-label", "航天专题路线");
    nav.innerHTML = trailPhases
      .map((phase) => {
        const moduleLinks = phase.modules
          .map((chapter) => {
            const isCurrent = chapter.slides.some(({ slide }) => slide === currentSlide);
            const pageMarks = chapter.slides
              .map(({ slide }) => `<i class="${slide === currentSlide ? "on" : ""}">${slide.dataset.kind}</i>`)
              .join("");
            const pages = isCurrent ? `<span class="trail-pages">${pageMarks}</span>` : "";
            return `<a class="trail-mod${isCurrent ? " is-current" : ""}" href="#${chapter.slides[0].slide.id}">${chapter.name}${pages}</a>`;
          })
          .join("");
        return `<div class="trail-phase"><span class="trail-phase-name">${phase.name}</span><div class="trail-mods">${moduleLinks}</div></div>`;
      })
      .join("");
    return nav;
  }
  slides
    .filter((slide) => slide.dataset.trail !== undefined)
    .forEach((slide) => {
      const trail = buildTrail(slide);
      slide.querySelector(".slide-inner").prepend(trail);
      const current = trail.querySelector(".is-current");
      if (current) trail.scrollLeft = current.offsetLeft - trail.clientWidth / 2 + current.offsetWidth / 2;
    });

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
      item.classList.toggle("is-active", isActive);
      if (isActive) reachedActive = true;
      item.classList.toggle("is-done", !reachedActive);
    });
    const percent = ((index + 1) / totalSlides) * 100;
    progressFill.style.width = `${percent}%`;
    progressText.textContent = `${pad(index + 1)} / ${pad(totalSlides)}`;
    topbarTitle.textContent = `${slide.dataset.chapter} · ${slide.dataset.title}`;
    topbarCount.textContent = `${index + 1}/${totalSlides}`;
    topbarProgress.style.width = `${percent}%`;
    const activeLink = slideLinks.get(slide);
    if (activeLink) activeLink.scrollIntoView({ block: "nearest" });
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

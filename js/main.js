/* 幻灯片式页面：生成左侧目录、跟踪当前页、键盘翻页、进场动画。 */
(function setupSlides() {
  const MOBILE_BREAKPOINT_PX = 900;
  const REVEAL_THRESHOLD = 0.25;
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
  chapters.forEach((chapter) => {
    const item = document.createElement("li");
    item.className = "toc-chapter";
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
    { threshold: REVEAL_THRESHOLD }
  );
  slides.forEach((slide) => revealObserver.observe(slide));

  /* ---------- 键盘翻页 ---------- */
  function goTo(index) {
    const target = slides[Math.max(0, Math.min(totalSlides - 1, index))];
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  document.addEventListener("keydown", (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (window.innerWidth <= MOBILE_BREAKPOINT_PX) return;
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

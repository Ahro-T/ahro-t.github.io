(() => {
  "use strict";

  const STORAGE_KEY = "ahro-docker-kubernetes-course-v1";
  const THEME_KEY = "ahro-course-theme";
  const CATEGORY_LABELS = {
    foundation: "FOUNDATION",
    docker: "DOCKER",
    kubernetes: "K8S CORE",
    operations: "OPERATIONS",
  };

  const state = {
    chunks: [],
    activeId: 1,
    filter: "all",
    query: "",
    progress: {
      completed: [],
      notes: {},
      lastActive: 1,
    },
    noteTimer: null,
  };

  const elements = {};

  function $(id) {
    return document.getElementById(id);
  }

  function cacheElements() {
    [
      "chunk-list",
      "empty-state",
      "course-search",
      "course-video",
      "now-time",
      "now-playing-title",
      "youtube-link",
      "lesson",
      "lesson-meta",
      "lesson-title",
      "lesson-question",
      "lesson-model",
      "lesson-core",
      "lesson-lab",
      "lesson-misconception",
      "lesson-check",
      "lesson-notes",
      "note-status",
      "complete-button",
      "progress-ring",
      "progress-percent",
      "previous-button",
      "next-button",
      "footer-previous",
      "footer-next",
      "start-button",
      "continue-button",
      "theme-toggle",
    ].forEach((id) => {
      elements[id] = $(id);
    });
    elements.filterButtons = Array.from(document.querySelectorAll(".filter-chip"));
  }

  function loadProgress() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!saved || typeof saved !== "object") return;
      state.progress.completed = Array.isArray(saved.completed) ? saved.completed.map(Number) : [];
      state.progress.notes = saved.notes && typeof saved.notes === "object" ? saved.notes : {};
      state.progress.lastActive = Number(saved.lastActive) || 1;
    } catch {
      state.progress = { completed: [], notes: {}, lastActive: 1 };
    }
  }

  function saveProgress() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.progress));
    } catch {
      elements["note-status"].textContent = "이 브라우저에서는 자동 저장을 사용할 수 없습니다.";
    }
  }

  function chunkFromHash() {
    const match = window.location.hash.match(/^#chunk-(\d{1,2})$/);
    return match ? Number(match[1]) : null;
  }

  function isCompleted(id) {
    return state.progress.completed.includes(Number(id));
  }

  function setText(element, value) {
    element.textContent = value || "";
  }

  function filteredChunks() {
    const query = state.query.trim().toLocaleLowerCase("ko");
    return state.chunks.filter((chunk) => {
      const categoryMatches = state.filter === "all" || chunk.category === state.filter;
      if (!categoryMatches) return false;
      if (!query) return true;
      const haystack = [
        chunk.title,
        chunk.question,
        chunk.model,
        chunk.core,
        chunk.lab,
        chunk.misconception,
        chunk.check,
      ].join(" ").toLocaleLowerCase("ko");
      return haystack.includes(query);
    });
  }

  function createChunkItem(chunk) {
    const item = document.createElement("li");
    item.className = "chunk-item";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "chunk-button";
    button.dataset.id = String(chunk.id);
    button.setAttribute("aria-label", `${chunk.id}번 ${chunk.title}, ${chunk.durationMinutes}분`);
    if (chunk.id === state.activeId) {
      button.classList.add("is-active");
      button.setAttribute("aria-current", "true");
    }
    if (isCompleted(chunk.id)) button.classList.add("is-complete");

    const number = document.createElement("span");
    number.className = "chunk-number";
    number.textContent = String(chunk.id).padStart(2, "0");

    const copy = document.createElement("span");
    copy.className = "chunk-copy";
    const title = document.createElement("strong");
    title.textContent = chunk.title;
    const meta = document.createElement("small");
    meta.textContent = `${chunk.startLabel} · ${chunk.durationMinutes}분`;
    copy.append(title, meta);

    const status = document.createElement("span");
    status.className = "chunk-status";
    status.textContent = "✓";
    status.setAttribute("aria-hidden", "true");

    button.append(number, copy, status);
    button.addEventListener("click", () => {
      selectChunk(chunk.id, { scroll: true, updateVideo: true });
    });
    item.append(button);
    return item;
  }

  function renderIndex() {
    const fragment = document.createDocumentFragment();
    const chunks = filteredChunks();
    chunks.forEach((chunk) => fragment.append(createChunkItem(chunk)));
    elements["chunk-list"].replaceChildren(fragment);
    elements["empty-state"].hidden = chunks.length !== 0;
  }

  function updateProgressDisplay() {
    const completeCount = state.chunks.filter((chunk) => isCompleted(chunk.id)).length;
    const percent = state.chunks.length ? Math.round((completeCount / state.chunks.length) * 100) : 0;
    elements["progress-percent"].textContent = `${percent}%`;
    elements["progress-ring"].style.setProperty("--progress", `${percent * 3.6}deg`);
    elements["progress-ring"].setAttribute(
      "aria-label",
      `전체 ${state.chunks.length}개 중 ${completeCount}개 완료, ${percent}%`,
    );

    const firstIncomplete = state.chunks.find((chunk) => !isCompleted(chunk.id));
    elements["continue-button"].textContent = firstIncomplete
      ? `${String(firstIncomplete.id).padStart(2, "0")}번부터 이어서`
      : "전체 코스 복습하기";
  }

  function updateCompleteButton(chunk) {
    const completed = isCompleted(chunk.id);
    elements["complete-button"].setAttribute("aria-pressed", String(completed));
    elements["complete-button"].querySelector(".complete-label").textContent = completed
      ? "완료됨"
      : "완료 표시";
  }

  function videoUrl(chunk) {
    const params = new URLSearchParams({
      rel: "0",
      modestbranding: "1",
      start: String(chunk.start),
    });
    return `https://www.youtube-nocookie.com/embed/kTp5xUtcalw?${params}`;
  }

  function youtubeUrl(chunk) {
    return `https://www.youtube.com/watch?v=kTp5xUtcalw&t=${chunk.start}s`;
  }

  function selectChunk(id, options = {}) {
    const chunk = state.chunks.find((candidate) => candidate.id === Number(id));
    if (!chunk) return;

    state.activeId = chunk.id;
    state.progress.lastActive = chunk.id;
    saveProgress();

    setText(elements["now-time"], chunk.startLabel);
    setText(elements["now-playing-title"], chunk.title);
    setText(elements["lesson-meta"], `CHUNK ${String(chunk.id).padStart(2, "0")} · ${CATEGORY_LABELS[chunk.category]} · ${chunk.durationMinutes}분`);
    setText(elements["lesson-title"], chunk.title);
    setText(elements["lesson-question"], chunk.question);
    setText(elements["lesson-model"], chunk.model);
    setText(elements["lesson-core"], chunk.core);
    setText(elements["lesson-lab"], chunk.lab);
    setText(elements["lesson-misconception"], chunk.misconception);
    setText(elements["lesson-check"], chunk.check);
    elements["lesson-notes"].value = state.progress.notes[String(chunk.id)] || "";
    elements["note-status"].textContent = "자동 저장됩니다.";

    elements["youtube-link"].href = youtubeUrl(chunk);
    if (options.updateVideo) {
      elements["course-video"].src = videoUrl(chunk);
    }

    const index = state.chunks.findIndex((candidate) => candidate.id === chunk.id);
    const atStart = index === 0;
    const atEnd = index === state.chunks.length - 1;
    [elements["previous-button"], elements["footer-previous"]].forEach((button) => {
      button.disabled = atStart;
    });
    [elements["next-button"], elements["footer-next"]].forEach((button) => {
      button.disabled = atEnd;
    });

    updateCompleteButton(chunk);
    history.replaceState(null, "", `#chunk-${String(chunk.id).padStart(2, "0")}`);
    renderIndex();

    if (options.scroll) {
      elements["lesson"].scrollIntoView({ behavior: "smooth", block: "start" });
      window.setTimeout(() => elements["lesson"].focus({ preventScroll: true }), 450);
    }
  }

  function adjacentChunk(direction, options = { scroll: true, updateVideo: true }) {
    const currentIndex = state.chunks.findIndex((chunk) => chunk.id === state.activeId);
    const nextIndex = currentIndex + direction;
    if (nextIndex < 0 || nextIndex >= state.chunks.length) return;
    selectChunk(state.chunks[nextIndex].id, options);
  }

  function toggleComplete() {
    const id = state.activeId;
    if (isCompleted(id)) {
      state.progress.completed = state.progress.completed.filter((completedId) => completedId !== id);
    } else {
      state.progress.completed = [...state.progress.completed, id].sort((a, b) => a - b);
    }
    saveProgress();
    updateCompleteButton(state.chunks.find((chunk) => chunk.id === id));
    updateProgressDisplay();
    renderIndex();
  }

  function saveNote() {
    const key = String(state.activeId);
    const value = elements["lesson-notes"].value.trimEnd();
    if (value) {
      state.progress.notes[key] = value;
    } else {
      delete state.progress.notes[key];
    }
    saveProgress();
    elements["note-status"].textContent = "저장됨";
  }

  function firstIncompleteId() {
    return state.chunks.find((chunk) => !isCompleted(chunk.id))?.id || 1;
  }

  function updateFilter(filter) {
    state.filter = filter;
    elements.filterButtons.forEach((button) => {
      button.classList.toggle("is-active", button.dataset.filter === filter);
    });
    renderIndex();
  }

  function toggleTheme() {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem(THEME_KEY, next);
    document.querySelector('meta[name="theme-color"]').content = next === "dark" ? "#07110f" : "#f5f8f6";
  }

  function bindEvents() {
    elements["course-search"].addEventListener("input", (event) => {
      state.query = event.target.value;
      renderIndex();
    });

    elements.filterButtons.forEach((button) => {
      button.addEventListener("click", () => updateFilter(button.dataset.filter));
    });

    elements["complete-button"].addEventListener("click", toggleComplete);
    elements["theme-toggle"].addEventListener("click", toggleTheme);

    [elements["previous-button"], elements["footer-previous"]].forEach((button) => {
      button.addEventListener("click", () => adjacentChunk(-1));
    });
    [elements["next-button"], elements["footer-next"]].forEach((button) => {
      button.addEventListener("click", () => adjacentChunk(1));
    });

    elements["start-button"].addEventListener("click", () => {
      selectChunk(1, { scroll: true, updateVideo: true });
    });
    elements["continue-button"].addEventListener("click", () => {
      selectChunk(firstIncompleteId(), { scroll: true, updateVideo: true });
    });

    elements["lesson-notes"].addEventListener("input", () => {
      elements["note-status"].textContent = "저장 중…";
      window.clearTimeout(state.noteTimer);
      state.noteTimer = window.setTimeout(saveNote, 450);
    });

    window.addEventListener("hashchange", () => {
      const id = chunkFromHash();
      if (id && id !== state.activeId) selectChunk(id, { scroll: false, updateVideo: true });
    });

    document.addEventListener("keydown", (event) => {
      if (event.target.matches("input, textarea")) return;
      if (event.key === "]") adjacentChunk(1, { scroll: false, updateVideo: true });
      if (event.key === "[") adjacentChunk(-1, { scroll: false, updateVideo: true });
    });
  }

  async function init() {
    cacheElements();
    loadProgress();

    try {
      const response = await fetch("./course-data.json");
      if (!response.ok) throw new Error(`course-data.json: ${response.status}`);
      const data = await response.json();
      if (!Array.isArray(data.chunks) || data.chunks.length !== 23) {
        throw new Error("청크 데이터 형식이 올바르지 않습니다.");
      }
      state.chunks = data.chunks;
    } catch (error) {
      console.error(error);
      elements["chunk-list"].innerHTML = '<li class="empty-state">학습 데이터를 불러오지 못했습니다. 잠시 후 새로고침해 주세요.</li>';
      return;
    }

    const initialId = chunkFromHash() || state.progress.lastActive || 1;
    bindEvents();
    updateProgressDisplay();
    selectChunk(initialId, { scroll: false, updateVideo: false });
  }

  init();
})();

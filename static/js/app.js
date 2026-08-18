(() => {
  "use strict";

  const STEPS = window.APP_CONFIG.steps;
  const PASS_PCT = window.APP_CONFIG.passPercentage;
  const BRAND = window.APP_CONFIG.brand || { name: "Sustainable Futures", short_name: "SF Training", powered_by: "Eurocert" };
  const TOTAL_PHASES = STEPS.length + 2;

  const ua = navigator.userAgent || "";
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(ua);
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;
  const canMediaRecord =
    !isIOS &&
    typeof MediaRecorder !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function" &&
    (typeof MediaRecorder.isTypeSupported !== "function" ||
      MediaRecorder.isTypeSupported("video/webm") ||
      MediaRecorder.isTypeSupported("video/mp4"));

  const screens = {
    home: document.getElementById("screenHome"),
    training: document.getElementById("screenTraining"),
    assessment: document.getElementById("screenAssessment"),
    certificate: document.getElementById("screenCertificate"),
  };
  const tabs = document.querySelectorAll(".tab");
  const stepTrack = document.getElementById("stepTrack");
  const stepTrackFill = document.getElementById("stepTrackFill");
  const headerStep = document.getElementById("headerStep");
  const headerStepLabel = document.getElementById("headerStepLabel");

  const previewVideo = document.getElementById("previewVideo");
  const videoContainer = document.getElementById("videoContainer");
  const btnRecord = document.getElementById("btnRecord");
  const btnStop = document.getElementById("btnStop");
  const iosCameraBtn = document.getElementById("iosCameraBtn");
  const cameraCapture = document.getElementById("cameraCapture");
  const btnSubmitStep = document.getElementById("btnSubmitStep");
  const fileUpload = document.getElementById("fileUpload");
  const timer = document.getElementById("timer");
  const timerText = document.getElementById("timerText");
  const videoError = document.getElementById("videoError");
  const recHint = document.getElementById("recHint");

  let mediaRecorder = null;
  let recordedChunks = [];
  let recordedBlob = null;
  let recordedDuration = 0;
  let durationUnknown = false;
  let timerInterval = null;
  let recordStartTime = null;
  let currentStepIndex = 0;
  let stream = null;
  let unlockedTabs = new Set(["home"]);

  document.body.classList.toggle("is-ios", isIOS);
  document.body.classList.toggle("is-android", isAndroid);

  setTimeout(() => document.getElementById("splash").classList.add("hidden"), 1000);

  // iOS uses the native camera; Android/desktop can record in-app.
  if (!canMediaRecord) {
    btnRecord.hidden = true;
    btnStop.hidden = true;
    iosCameraBtn.hidden = false;
    recHint.textContent = "Tap the red button to open your camera. Record 1–2 minutes, then submit.";
  } else {
    recHint.textContent = "Tap record (1–2 min) or upload a video from your gallery.";
  }

  // --- Install: Android prompt / iOS Add to Home Screen ---
  let deferredPrompt = null;
  const installBanner = document.getElementById("installBanner");
  const installText = document.getElementById("installText");
  const btnInstall = document.getElementById("btnInstall");
  const iosSheet = document.getElementById("iosInstallSheet");

  function showInstallBanner() {
    if (isStandalone || localStorage.getItem("installDismissed")) return;
    installBanner.hidden = false;
    if (isIOS) {
      installText.textContent = `Add ${BRAND.short_name} to your iPhone home screen`;
      btnInstall.textContent = "How";
    } else if (isAndroid && deferredPrompt) {
      installText.textContent = `Install ${BRAND.name} on Android`;
      btnInstall.textContent = "Install";
    } else if (isAndroid) {
      installText.textContent = "Chrome menu → Install app / Add to Home screen";
      btnInstall.textContent = "OK";
    }
  }

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    showInstallBanner();
  });

  if (isIOS && !isStandalone) {
    setTimeout(showInstallBanner, 1800);
  } else if (isAndroid && !isStandalone) {
    setTimeout(showInstallBanner, 2200);
  }

  btnInstall?.addEventListener("click", async () => {
    if (isIOS) {
      iosSheet.hidden = false;
      return;
    }
    if (deferredPrompt) {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
      installBanner.hidden = true;
      return;
    }
    installBanner.hidden = true;
  });

  document.getElementById("btnDismissInstall")?.addEventListener("click", () => {
    installBanner.hidden = true;
    localStorage.setItem("installDismissed", "1");
  });
  document.getElementById("btnCloseIosSheet")?.addEventListener("click", () => {
    iosSheet.hidden = true;
    installBanner.hidden = true;
    localStorage.setItem("installDismissed", "1");
  });

  async function api(url, options = {}) {
    const res = await fetch(url, {
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", ...options.headers },
      ...options,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Request failed");
    return data;
  }

  function showScreen(name) {
    Object.entries(screens).forEach(([key, el]) => {
      if (!el) return;
      const isActive = key === name;
      el.hidden = !isActive;
      el.classList.toggle("active", isActive);
    });
    tabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.tab === name));

    const showTrack = name !== "home";
    stepTrack.hidden = !showTrack;
    headerStep.hidden = !showTrack;

    if (name === "home") updateProgress(0);
    else if (name === "training") updateProgress(currentStepIndex + 1);
    else if (name === "assessment") updateProgress(STEPS.length + 1);
    else if (name === "certificate") updateProgress(TOTAL_PHASES);
  }

  function updateProgress(phase) {
    stepTrackFill.style.width = `${(phase / TOTAL_PHASES) * 100}%`;
    if (phase <= STEPS.length) headerStepLabel.textContent = `Module ${phase}/${STEPS.length}`;
    else if (phase === STEPS.length + 1) headerStepLabel.textContent = "Assessment";
    else headerStepLabel.textContent = "Certificate";
  }

  function unlockTab(name) {
    unlockedTabs.add(name);
    tabs.forEach((tab) => {
      if (tab.dataset.tab === name) tab.classList.remove("locked");
    });
  }

  tabs.forEach((tab) => {
    tab.classList.add("locked");
    if (tab.dataset.tab === "home") tab.classList.remove("locked");
    tab.addEventListener("click", () => {
      const target = tab.dataset.tab;
      if (!unlockedTabs.has(target)) return;
      showScreen(target);
    });
  });

  document.getElementById("btnStart").addEventListener("click", async () => {
    const candidateName = document.getElementById("candidateName").value.trim();
    const courseName = document.getElementById("courseName").value;
    if (!candidateName || candidateName.length < 2) {
      document.getElementById("candidateName").focus();
      return;
    }
    try {
      await api("/api/register", {
        method: "POST",
        body: JSON.stringify({ candidateName, courseName }),
      });
      currentStepIndex = 0;
      unlockTab("training");
      showScreen("training");
      renderStep(0);
    } catch (err) {
      alert(err.message);
    }
  });

  async function loadProgress() {
    try {
      const data = await api("/api/progress");
      const { progress, phase } = data;
      if (phase === "registration") return;
      unlockTab("training");
      if (phase === "training") {
        currentStepIndex = data.completed_count;
        renderStep(currentStepIndex);
        renderCompletedSteps(progress.completed_steps);
        showScreen("training");
      } else if (phase === "assessment") {
        unlockTab("assessment");
        showScreen("assessment");
      } else if (phase === "certificate") {
        unlockTab("assessment");
        unlockTab("certificate");
        await showCertificate();
      }
    } catch (e) { /* fresh session */ }
  }

  function renderStep(index) {
    const step = STEPS[index];
    if (!step) return;
    document.getElementById("stepPill").textContent = `Module ${step.id} of ${STEPS.length}`;
    document.getElementById("stepTitle").textContent = step.title;
    document.getElementById("stepDescription").textContent = step.description;
    const hero = document.getElementById("moduleHeroImg");
    if (hero && step.image) hero.src = step.image;
    resetVideo();
    btnSubmitStep.disabled = true;
    hideError();
    updateProgress(index + 1);
  }

  function renderCompletedSteps(completed) {
    const el = document.getElementById("completedStepsList");
    if (!completed?.length) { el.innerHTML = ""; return; }
    el.innerHTML = `<h4>Completed</h4>` + completed.map((id) => {
      const step = STEPS.find((s) => s.id === id);
      return `<div class="done-item">✓ ${step?.title || `Step ${id}`}</div>`;
    }).join("");
  }

  function getSupportedMimeType() {
    if (typeof MediaRecorder === "undefined") return "";
    const types = [
      "video/webm;codecs=vp8,opus",
      "video/webm;codecs=vp9,opus",
      "video/webm",
      "video/mp4",
    ];
    for (const t of types) {
      if (MediaRecorder.isTypeSupported(t)) return t;
    }
    return "";
  }

  async function startRecording() {
    hideError();
    if (!canMediaRecord) {
      cameraCapture.click();
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "user" }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true,
      });
      previewVideo.srcObject = stream;
      previewVideo.muted = true;
      previewVideo.setAttribute("playsinline", "");
      previewVideo.play().catch(() => {});
      videoContainer.classList.add("has-video");

      recordedChunks = [];
      const mime = getSupportedMimeType();
      mediaRecorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      mediaRecorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) recordedChunks.push(e.data); };
      mediaRecorder.onstop = () => {
        recordedBlob = new Blob(recordedChunks, { type: mediaRecorder.mimeType || "video/webm" });
        recordedDuration = (Date.now() - recordStartTime) / 1000;
        durationUnknown = false;
        previewVideo.srcObject = null;
        previewVideo.src = URL.createObjectURL(recordedBlob);
        previewVideo.muted = false;
        previewVideo.controls = true;
        previewVideo.play().catch(() => {});
        stopStream();
        validateDuration(recordedDuration, STEPS[currentStepIndex]);
      };

      mediaRecorder.start(1000);
      recordStartTime = Date.now();
      btnRecord.hidden = true;
      btnStop.hidden = false;
      timer.hidden = false;
      timerInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - recordStartTime) / 1000);
        timerText.textContent = `${Math.floor(elapsed / 60)}:${(elapsed % 60).toString().padStart(2, "0")}`;
        if (elapsed >= (STEPS[currentStepIndex]?.max_seconds || 120) + 5) stopRecording();
      }, 500);
    } catch {
      showError("Allow camera and microphone, or use Upload to pick a video from your gallery.");
      cameraCapture.click();
    }
  }

  function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      try { mediaRecorder.stop(); } catch (e) { /* ignore */ }
    }
    clearInterval(timerInterval);
    if (canMediaRecord) {
      btnRecord.hidden = false;
      btnStop.hidden = true;
    }
    timer.hidden = true;
  }

  function stopStream() {
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }
  }

  function resetVideo() {
    stopRecording();
    stopStream();
    recordedBlob = null;
    recordedDuration = 0;
    durationUnknown = false;
    recordedChunks = [];
    previewVideo.removeAttribute("src");
    previewVideo.srcObject = null;
    previewVideo.controls = false;
    videoContainer.classList.remove("has-video");
    if (fileUpload) fileUpload.value = "";
    if (cameraCapture) cameraCapture.value = "";
  }

  function validateDuration(duration, step) {
    if (!step) return;
    if (!isFinite(duration) || duration <= 0) {
      durationUnknown = true;
      hideError();
      btnSubmitStep.disabled = false;
      recHint.textContent = "Video attached. Record 1–2 minutes, then submit.";
      return;
    }
    durationUnknown = false;
    if (duration < step.min_seconds) {
      showError(`Too short (${Math.round(duration)}s). Need at least ${step.min_seconds}s.`);
      btnSubmitStep.disabled = true;
    } else if (duration > step.max_seconds + 8) {
      showError(`Too long (${Math.round(duration)}s). Max ${step.max_seconds}s.`);
      btnSubmitStep.disabled = true;
    } else {
      hideError();
      btnSubmitStep.disabled = false;
    }
  }

  function getVideoDuration(file) {
    return new Promise((resolve) => {
      const v = document.createElement("video");
      v.preload = "metadata";
      v.muted = true;
      v.playsInline = true;
      v.setAttribute("playsinline", "");
      const url = URL.createObjectURL(file);
      let settled = false;
      const finish = (d) => {
        if (settled) return;
        settled = true;
        URL.revokeObjectURL(url);
        resolve(d);
      };
      v.onloadedmetadata = () => {
        if (isFinite(v.duration) && v.duration > 0) {
          finish(v.duration);
        } else {
          try { v.currentTime = 1e10; } catch (e) { finish(null); }
        }
      };
      v.ontimeupdate = () => {
        if (isFinite(v.duration) && v.duration > 0) finish(v.duration);
      };
      v.ondurationchange = () => {
        if (isFinite(v.duration) && v.duration > 0) finish(v.duration);
      };
      v.onerror = () => finish(null);
      setTimeout(() => finish(null), 4000);
      v.src = url;
    });
  }

  async function handlePickedVideo(file) {
    if (!file) return;
    hideError();
    recordedBlob = file;
    const url = URL.createObjectURL(file);
    previewVideo.srcObject = null;
    previewVideo.src = url;
    previewVideo.muted = true;
    previewVideo.controls = true;
    previewVideo.setAttribute("playsinline", "");
    videoContainer.classList.add("has-video");
    previewVideo.play().catch(() => {});

    const duration = await getVideoDuration(file);
    recordedDuration = duration || 0;
    validateDuration(recordedDuration, STEPS[currentStepIndex]);
  }

  function showError(msg) { videoError.textContent = msg; videoError.hidden = false; }
  function hideError() { videoError.hidden = true; }

  btnRecord.addEventListener("click", startRecording);
  btnStop.addEventListener("click", stopRecording);
  fileUpload.addEventListener("change", () => handlePickedVideo(fileUpload.files[0]));
  cameraCapture.addEventListener("change", () => handlePickedVideo(cameraCapture.files[0]));

  btnSubmitStep.addEventListener("click", async () => {
    if (!recordedBlob) return;
    btnSubmitStep.disabled = true;
    btnSubmitStep.textContent = "Uploading…";
    const step = STEPS[currentStepIndex];
    const ext = guessExt(recordedBlob);
    const formData = new FormData();
    formData.append("video", recordedBlob, `step_${step.id}${ext}`);
    formData.append("duration", String(recordedDuration || 0));
    if (durationUnknown) formData.append("durationUnknown", "1");

    try {
      const res = await fetch(`/api/steps/${step.id}/upload`, {
        method: "POST",
        body: formData,
        credentials: "same-origin",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");

      renderCompletedSteps(data.completed_steps);

      if (data.all_steps_done) {
        unlockTab("assessment");
        showScreen("assessment");
      } else {
        currentStepIndex++;
        renderStep(currentStepIndex);
      }
    } catch (err) {
      showError(err.message);
      btnSubmitStep.disabled = false;
    } finally {
      btnSubmitStep.textContent = "Submit & Continue";
    }
  });

  function guessExt(blob) {
    const type = (blob.type || "").toLowerCase();
    if (type.includes("mp4")) return ".mp4";
    if (type.includes("quicktime") || type.includes("mov")) return ".mov";
    if (type.includes("webm")) return ".webm";
    if (type.includes("3gpp")) return ".3gp";
    if (blob.name && /\.[a-z0-9]+$/i.test(blob.name)) {
      return blob.name.slice(blob.name.lastIndexOf(".")).toLowerCase();
    }
    return isIOS ? ".mov" : ".webm";
  }

  document.querySelectorAll(".quiz-opt").forEach((label) => {
    label.addEventListener("click", () => {
      const name = label.querySelector("input")?.name;
      document.querySelectorAll(`input[name="${name}"]`).forEach((input) => {
        input.closest(".quiz-opt")?.classList.toggle("selected", input.checked || input === label.querySelector("input"));
      });
      const radio = label.querySelector("input");
      if (radio) {
        radio.checked = true;
        document.querySelectorAll(`input[name="${radio.name}"]`).forEach((input) => {
          input.closest(".quiz-opt")?.classList.toggle("selected", input.checked);
        });
      }
    });
  });

  document.getElementById("btnSubmitAssessment").addEventListener("click", async () => {
    const form = document.getElementById("assessmentForm");
    const answers = {};
    document.querySelectorAll(".quiz-card").forEach((q) => {
      const qid = q.dataset.qid;
      const selected = form.querySelector(`input[name="${qid}"]:checked`);
      if (selected) answers[qid] = parseInt(selected.value, 10);
    });

    if (Object.keys(answers).length < window.APP_CONFIG.questionCount) {
      alert("Please answer all questions.");
      return;
    }

    const btn = document.getElementById("btnSubmitAssessment");
    btn.disabled = true;
    btn.textContent = "Checking…";

    try {
      const data = await api("/api/assessment/submit", {
        method: "POST",
        body: JSON.stringify({ answers }),
      });

      const resultEl = document.getElementById("assessmentResult");
      resultEl.hidden = false;

      if (data.passed) {
        resultEl.className = "result-banner passed";
        resultEl.innerHTML = `<strong>Trade assessment passed</strong> — ${data.score}% (${data.correct}/${data.total})`;
        unlockTab("certificate");
        await showCertificate();
      } else {
        resultEl.className = "result-banner failed";
        resultEl.innerHTML = `<strong>Not passed</strong> — ${data.score}%. Need ${PASS_PCT}%. Try again.`;
        btn.disabled = false;
        btn.textContent = "Submit Assessment";
      }
    } catch (err) {
      alert(err.message);
      btn.disabled = false;
      btn.textContent = "Submit Assessment";
    }
  });

  async function showCertificate() {
    try {
      const data = await api("/api/certificate/generate", { method: "POST" });
      showScreen("certificate");

      document.getElementById("certSubtitle").textContent =
        `${data.candidateName}, you've earned your certificate!`;

      document.getElementById("certDetails").innerHTML = `
        <div class="cert-row"><dt>Name</dt><dd>${escapeHtml(data.candidateName)}</dd></div>
        <div class="cert-row"><dt>Course</dt><dd>${escapeHtml(data.courseName)}</dd></div>
        <div class="cert-row"><dt>Grade</dt><dd>${escapeHtml(data.grade)}</dd></div>
        <div class="cert-row"><dt>Cert ID</dt><dd>${escapeHtml(data.certificateId)}</dd></div>
      `;

      document.getElementById("qrImage").src = data.qrUrl + "?t=" + Date.now();
      const dl = document.getElementById("btnDownload");
      dl.href = data.pdfUrl;
      dl.removeAttribute("download");
      dl.setAttribute("target", "_blank");
      dl.setAttribute("rel", "noopener");

      document.getElementById("btnShare").onclick = async () => {
        const shareData = {
          title: `${BRAND.name} Certificate`,
          text: `${data.candidateName} — ${data.courseName}`,
          url: data.verifyUrl,
        };
        try {
          if (navigator.share) {
            await navigator.share(shareData);
          } else if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(data.verifyUrl);
            alert("Certificate link copied.");
          } else {
            prompt("Copy this certificate link:", data.verifyUrl);
          }
        } catch (e) {
          if (e && e.name !== "AbortError") prompt("Copy this certificate link:", data.verifyUrl);
        }
      };
    } catch (err) {
      alert("Certificate error: " + err.message);
    }
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  showScreen("home");
  loadProgress();
})();

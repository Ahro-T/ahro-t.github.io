const scriptBundle = document.getElementById("script-bundle");
const copyText = scriptBundle?.getAttribute("data-copy") || "Copy";
const copiedText = scriptBundle?.getAttribute("data-copied") || "Copied";

function createCopyButton(highlightWrapper) {
  const button = document.createElement("button");
  button.className = "copy-button";
  button.type = "button";
  button.ariaLabel = copyText;
  button.setAttribute("aria-live", "polite");
  button.innerText = copyText;
  button.addEventListener("click", () => copyCodeToClipboard(button, highlightWrapper));
  highlightWrapper.insertBefore(button, highlightWrapper.firstChild);
}

async function copyCodeToClipboard(button, highlightWrapper) {
  const codeToCopy = getCodeText(highlightWrapper);

  function fallback(text, wrapper) {
    const textArea = document.createElement("textarea");
    textArea.contentEditable = "true";
    textArea.readOnly = false;
    textArea.className = "copy-textarea";
    textArea.value = text;
    wrapper.insertBefore(textArea, wrapper.firstChild);
    textArea.focus();
    textArea.select();
    document.execCommand("copy");
    wrapper.removeChild(textArea);
  }

  try {
    const permission = await navigator.permissions.query({ name: "clipboard-write" });
    if (permission.state === "granted" || permission.state === "prompt") {
      await navigator.clipboard.writeText(codeToCopy);
    } else {
      fallback(codeToCopy, highlightWrapper);
    }
  } catch (_) {
    fallback(codeToCopy, highlightWrapper);
  } finally {
    button.innerText = copiedText;
    setTimeout(() => {
      button.innerText = copyText;
    }, 2000);
  }
}

function getCodeText(highlightWrapper) {
  const highlight = highlightWrapper.querySelector(".highlight");
  if (!highlight) return "";

  const codeBlock = highlight.querySelector("code");
  const inlineLines = codeBlock?.querySelectorAll(".cl");
  const tableCodeCell = highlight.querySelector(".lntable .lntd:last-child code");
  if (!codeBlock) return "";

  if (inlineLines?.length > 0) {
    return Array.from(inlineLines)
      .map((line) => line.textContent.replace(/\n$/, ""))
      .join("\n");
  }

  if (tableCodeCell) return tableCodeCell.textContent.trim();
  return codeBlock.textContent.trim();
}

window.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".highlight-wrapper").forEach(createCopyButton);
});

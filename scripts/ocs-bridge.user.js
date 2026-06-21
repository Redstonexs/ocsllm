// ==UserScript==
// @name OCS LLM Solver Bridge
// @namespace local.ocsllm
// @version 0.1.0
// @description Collect visible question text, options, and images for /api/solve.
// @match *://*/*
// @grant none
// ==/UserScript==

(() => {
  "use strict"

  const config = {
    apiBase: "http://127.0.0.1:3107",
    questionType: "single",
    selectors: {
      title: ".question-title, .title, [data-question-title], h1, h2",
      option: ".option, .answer-option, [data-option]",
      image: ".question img, [data-question] img, img[data-question-image]",
    },
  }

  function firstText(selector) {
    const node = document.querySelector(selector)
    return node?.textContent?.trim() ?? ""
  }

  function collectOptions() {
    return Array.from(document.querySelectorAll(config.selectors.option))
      .map((node) => node.textContent?.trim() ?? "")
      .filter((text) => text.length > 0)
  }

  function absoluteUrl(value) {
    return new URL(value, window.location.href).toString()
  }

  async function collectImageInput(image) {
    const rawUrl = image.currentSrc || image.src
    if (rawUrl.length === 0) {
      return undefined
    }

    const imageUrl = absoluteUrl(rawUrl)
    if (new URL(imageUrl).origin !== window.location.origin) {
      return { kind: "url", url: imageUrl }
    }

    try {
      if (!image.complete) {
        await image.decode()
      }

      if (image.naturalWidth === 0 || image.naturalHeight === 0) {
        return { kind: "url", url: imageUrl }
      }

      const canvas = document.createElement("canvas")
      canvas.width = image.naturalWidth
      canvas.height = image.naturalHeight
      const context = canvas.getContext("2d")
      if (context === null) {
        return { kind: "url", url: imageUrl }
      }

      context.drawImage(image, 0, 0)
      const dataUrl = canvas.toDataURL("image/png")
      const marker = "base64,"
      const markerIndex = dataUrl.indexOf(marker)
      if (markerIndex === -1) {
        return { kind: "url", url: imageUrl }
      }

      return {
        kind: "base64",
        mimeType: "image/png",
        imageBase64: dataUrl.slice(markerIndex + marker.length),
      }
    } catch {
      return { kind: "url", url: imageUrl }
    }
  }

  async function collectImages() {
    const images = Array.from(document.querySelectorAll(config.selectors.image))
    const inputs = []

    for (const image of images) {
      const input = await collectImageInput(image)
      if (input !== undefined) {
        inputs.push(input)
      }
    }

    return inputs
  }

  async function buildPayload() {
    const title = firstText(config.selectors.title) || document.title.trim()
    const options = collectOptions()
    const images = await collectImages()

    if (images.length > 0) {
      return {
        kind: "image",
        title,
        type: config.questionType,
        options,
        images,
      }
    }

    return {
      kind: "text",
      title,
      type: config.questionType,
      options,
    }
  }

  async function requestAnswer(statusNode, resultNode) {
    statusNode.textContent = "Solving"
    resultNode.textContent = ""

    try {
      const payload = await buildPayload()
      const response = await fetch(`${config.apiBase}/api/solve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      })
      const body = await response.json()

      if (!response.ok) {
        statusNode.textContent = "Error"
        resultNode.textContent = JSON.stringify(body, null, 2)
        return
      }

      statusNode.textContent = "Done"
      resultNode.textContent = body.answer ?? JSON.stringify(body, null, 2)
    } catch (error) {
      statusNode.textContent = "Error"
      resultNode.textContent = error instanceof Error ? error.message : "Unknown error"
    }
  }

  function mountPanel() {
    const panel = document.createElement("section")
    panel.style.cssText =
      "position:fixed;right:16px;bottom:16px;z-index:2147483647;width:260px;padding:12px;background:#111827;color:#f9fafb;border:1px solid #374151;border-radius:8px;font:13px system-ui, sans-serif;box-shadow:0 10px 24px rgba(0,0,0,.24)"

    const button = document.createElement("button")
    button.type = "button"
    button.textContent = "Solve"
    button.style.cssText =
      "width:100%;height:32px;border:0;border-radius:6px;background:#0ea5e9;color:#001018;font-weight:700"

    const statusNode = document.createElement("div")
    statusNode.textContent = "Ready"
    statusNode.style.cssText = "margin-top:8px;color:#bae6fd"

    const resultNode = document.createElement("pre")
    resultNode.style.cssText =
      "margin:8px 0 0;white-space:pre-wrap;max-height:160px;overflow:auto;color:#f8fafc"

    button.addEventListener("click", () => {
      void requestAnswer(statusNode, resultNode)
    })

    panel.append(button, statusNode, resultNode)
    document.documentElement.append(panel)
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountPanel, { once: true })
    return
  }

  mountPanel()
})()

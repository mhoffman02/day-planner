# Evaluation Task: Exploring `gpt-oss` Integration in Antigravity CLI

**Target Workspace**: `day-planner` & `maximo-uat`  
**Hardware Profile**: Lenovo ThinkPad X1 Carbon Gen 9 (Intel i7-1165G7, 16GB RAM, Intel Iris Xe iGPU)  
**Status**: Ready for User Evaluation  
**Date**: 2026-08-16  

---

## 1. Executive Summary & Purpose

This document outlines a structured evaluation plan for integrating **`gpt-oss`** (open-weights/open-source LLMs such as DeepSeek-R1, Qwen 2.5 Coder, or Llama 3) into your **Google Antigravity CLI (`agy`)** workflow.

The core objective is to move from a single-model paradigm to a **hybrid multi-model agent architecture**:
* **Primary / Lead Agent (Cloud)**: `Gemini 3.6 Flash` (or Pro) for high-level reasoning, complex multi-file strategy, live web research, and interactive turns.
* **Worker Subagent Tier (`gpt-oss`)**: Local/self-hosted unmetered open-weights models for high-frequency, privacy-sensitive, or repetitive code tasks.

---

## 2. Hardware Profile & Local Execution Constraints

Your specific hardware setup dictates which open-source models can run acceptably:

### Hardware Specifications
* **CPU**: 11th Gen Intel(R) Core(TM) i7-1165G7 @ 2.80GHz (4 cores / 8 threads, AVX-512 SIMD)
* **GPU**: Integrated Intel Iris Xe Graphics (Shared VRAM)
* **RAM**: 16 GB Total Physical System Memory (LPDDR4x-4266 **soldered to motherboard; non-upgradable**)
* **Connectivity**: 2x Thunderbolt 4 / USB4 (40 Gbps with 4x PCIe lanes)

### Key Realities & Limits
1. **CPU-Bound Inference**: Without a discrete NVIDIA GPU with dedicated VRAM, model execution runs 100% on the CPU. Execution speed is directly limited by system memory bandwidth (~30–40 GB/s).
2. **RAM Budget**: Models must fit within your Linux RAM limit (3GB – 5.5GB footprint) to leave headroom for OS, Antigravity CLI, Node.js, and Chrome.
3. **Execution Speed Thresholds**:
   * **1.5B – 3B models**: ⚡ **35–50 tokens/sec** (Feels instant, fast as cloud APIs).
   * **7B – 8B models**: 🚀 **15–25 tokens/sec** (Very usable; 5–10 seconds per response).
   * **14B models**: 🐢 **4–8 tokens/sec** (Sluggish; usable only for non-interactive background tasks).
   * **32B+ models**: ❌ **Unusable** (Exceeds 16GB system RAM, causes disk thrashing / OOM crash).

---

## 3. Workflow & Skill Analysis Matrix (Hardware-Tailored)

Based on an audit of your custom skills across `day-planner` and `maximo-uat-commands` tuned for your ThinkPad X1:

### 🟢 Category A: Prime Candidates for Local `gpt-oss`

| Skill / Workflow | Current Task | Why Transfer to `gpt-oss`? | Recommended Model (ThinkPad Tuned) | Speed & Footprint |
| :--- | :--- | :--- | :--- | :--- |
| **`/review` & `/local-review-uncommitted`** | Checking ESM `.js` import extensions, `src/` vs `gas-app/` parity, log pollution, and pre-commit checks. | Zero API token cost; zero data egress; fast AST-level checks on every git save. | **`qwen2.5-coder:3b`** *(Q4_K_M)* | ⚡ 35–50 tok/s (~1.9 GB RAM) |
| **`/simplify`** | Code reuse audit, null-check fortification, and loop efficiency review. | High-frequency code analysis; unmetered refactoring suggestions. | **`qwen2.5-coder:7b`** *(Q4_K_M)* | 🚀 15–25 tok/s (~4.4 GB RAM) |
| **`/convert` & `/convert-tier4`** | Converting Word UAT scripts (`.docx`) to Gherkin `.feature` files with step mapping. | High token volume per script; rigid schema enforcement avoids cloud hallucinations. | **`qwen2.5-coder:7b`** / **`deepseek-r1:7b`** | 🚀 15–20 tok/s (~4.5 GB RAM) |
| **`/compact`, `/compress`, `/checkpoint`** | Parsing git state and `PLAN.md` to output standard `RESUME.md` prompt blocks. | Low-complexity text extraction; instant local completion without consuming API quota. | **`llama3.2:3b`** / **`qwen2.5-coder:3b`** | ⚡ 35–45 tok/s (~2.0 GB RAM) |
| **`/retro`** | Formatting session learnings into `LEARNINGS.md` tables/blocks. | Pure template population; ideal for local background workers. | **`qwen2.5-coder:3b`** | ⚡ 35–50 tok/s (~1.9 GB RAM) |

---

### 🟡 Category B: Retain on `Gemini 3.6 Flash`

These skills require capabilities unique to cloud flagship models:

| Skill / Workflow | Current Task | Why Retain on `Gemini-Flash`? |
| :--- | :--- | :--- |
| **`/web-research-bugs` & `/youtube-research`** | Browsing live docs (GAS API, MDN, StackOverflow) and synthesizing web search results. | Requires fast web retrieval tools and massive context ingestion. |
| **`/advisor`** | High-level architectural consultation, debugging strategy, and cross-system design trade-offs. | Benefits from Gemini's deep reasoning and whole-repo context awareness. |
| **`/test` & Active Probe Loops** | Asynchronous CDP browser automation polling (`smoke-run.log`) and live error diagnosis. | Requires real-time tool execution loops and fast response turns. |
| **`/work-to-home` & `/gdrive-download`** | CLI orchestration (`clasp`, `git push`, environment syncing). | Pure tool-driver workflows where low tool latency is primary. |

---

## 4. Hardware Expansion & Offload Options

Since the ThinkPad X1 Carbon Gen 9 RAM and iGPU cannot be upgraded internally, here are the three viable hardware offloading strategies and market pricing:

### Option 1: Thunderbolt 4 eGPU Enclosure (Direct Laptop Dock)
*Plugs directly into the X1 Carbon Gen 9 Thunderbolt 4 port via a single USB-C cable.*

* **1A. Budget DIY Dock**: **TH3P4G3 TB4 Board** ($160) + Used **NVIDIA RTX 3060 12GB** ($220) + 500W ATX PSU ($50) = **Est. Total ~$430 – $480**
  * *VRAM & Speed*: **12GB VRAM**. Runs 7B and 14B Qwen/DeepSeek models at 35–50 tok/s.
* **1B. Consumer Plug-and-Play**: **Razer Core X / Core X V2** ($250–$350) + **NVIDIA RTX 3060 12GB** ($250) = **Est. Total ~$500 – $600**
  * *VRAM & Speed*: **12GB VRAM**. Clean enclosed aluminum chassis with internal 650W PSU. Single-cable laptop charging + GPU.
* **1C. Pro High-VRAM Tier**: **Sonnet eGFX Breakaway Box** ($300) + **NVIDIA RTX 4060 Ti 16GB** ($449–$479) = **Est. Total ~$749 – $829**
  * *VRAM & Speed*: **16GB VRAM**. Runs full 14B models natively in VRAM and 32B Q4 models at 30–45 tok/s.

---

### Option 2: Dedicated Mini-PC / Home Server Options (LAN Offload)
*Headless server on your local Wi-Fi/Ethernet router; Antigravity connects via local IP (`http://192.168.x.x:11434`).*

* **2A. Compact Mini PC**: **Beelink SER6 / SER7** (AMD Ryzen 7, 32GB DDR5 RAM, 1TB NVMe) = **Est. Price ~$420 – $550**
  * *Capability*: **32GB DDR5 RAM**. Runs 7B and 14B models on CPU/Radeon 780M at 18–30 tok/s silently on your local network.
* **2B. High-RAM Mini PC**: **Minisforum Venus UM790 Pro** (AMD Ryzen 9, 64GB DDR5 RAM, 1TB NVMe) = **Est. Price ~$750 – $950**
  * *Capability*: **64GB DDR5 RAM**. Large memory pool allows hosting 32B models (`qwen2.5-coder:32b`) over local LAN.
* **2C. Refurbished SFF Desktop + GPU**: Refurbished **Dell OptiPlex / HP Elite SFF** ($200) + **NVIDIA RTX 3060 12GB** ($230) = **Est. Total ~$430 – $480**
  * *Capability*: **12GB VRAM**. Dedicated desktop host on your home network with discrete GPU acceleration.

---

### Option 3: Used / Refurbished Apple Silicon Macs (Unified Memory Powerhouse)
*Apple's M-series chips use **Unified Memory Architecture (UMA)** with 100 GB/s to 200 GB/s bandwidth. The GPU and CPU share **100% of system RAM as VRAM**.*

* **3A. Best Value LAN Host**: **Used Mac Mini M1 or M2** (16GB Unified Memory, 256GB/512GB SSD) = **Est. Used Price $440 – $650**
  * *Bandwidth*: **100 GB/s UMA**. Runs `qwen2.5-coder:7b` at **30–45 tok/s** and `deepseek-r1:14b` at **15–22 tok/s**. Sips 15W of power.
* **3B. Ultra-Light Laptop Upgrade**: **Used MacBook Air M2 or M3** (16GB or 24GB Unified Memory) = **Est. Used Price $750 – $950**
  * *Bandwidth*: **100 GB/s UMA**. Complete laptop replacement for your ThinkPad. Runs 7B and 14B models natively on battery with zero fan noise.
* **3C. Heavyweight Local LLM Beast**: **Used MacBook Pro 14" M1 Pro / M2 Pro** (32GB Unified Memory) = **Est. Used Price $1,150 – $1,399**
  * *Bandwidth*: **200 GB/s UMA** *(2x bandwidth!)*. Runs **32B models (`qwen2.5-coder:32b`)** at **18–28 tok/s** smoothly.

---

## 5. Evaluation Roadmap for ThinkPad X1

Follow this step-by-step checklist to set up and benchmark `gpt-oss` on your laptop.

### Phase 1: Local Runner & Model Setup
- [ ] **Install Ollama** (Linux / WSL2):
  ```bash
  curl -fsSL https://ollama.com/install.sh
  ```
- [ ] **Pull ThinkPad-Optimized Models**:
  ```bash
  # Fast local worker for quick linting, formatting, & review
  ollama pull qwen2.5-coder:3b

  # Heavy local worker for deep refactoring & Gherkin conversions
  ollama pull qwen2.5-coder:7b

  # Fast reasoning specialist
  ollama pull deepseek-r1:1.5b
  ```
- [ ] **(Optional) Expand WSL2 RAM Allocation**:
  Add this to `C:\Users\<YourUsername>\.wslconfig` in Windows to grant Linux 12GB RAM:
  ```ini
  [wsl2]
  memory=12GB
  processors=6
  ```

### Phase 2: Antigravity CLI Integration
- [ ] **Configure Custom Provider Endpoint**:
  Add local provider endpoint details in `~/.gemini/antigravity-cli/settings.json` or subagent configurations:
  ```json
  {
    "providers": {
      "local-gpt-oss": {
        "type": "openai-compatible",
        "baseUrl": "http://localhost:11434/v1",
        "apiKey": "ollama"
      }
    }
  }
  ```
- [ ] **Define a Dedicated Subagent**:
  Test defining an offline reviewer subagent in your workspace:
  ```javascript
  define_subagent({
    name: "local_reviewer",
    description: "Unmetered local code quality & lint checker using Qwen 3B",
    system_prompt: "You are a local code reviewer. Verify ESM imports use .js extensions and inspect for unhandled promises."
  });
  ```

### Phase 3: Pilot Benchmarking
- [ ] **Benchmark Test 1 (`/review`)**:
  Run local static code review on `src/` using `qwen2.5-coder:3b` vs `Gemini-Flash`.
  *Metrics to record*: Processing time (~2–4s expected), accuracy in finding missing `.js` extensions.
- [ ] **Benchmark Test 2 (`/convert`)**:
  Feed a Word UAT script into `qwen2.5-coder:7b` for Gherkin conversion.
  *Metrics to record*: Schema compliance, handling of `@manual` step rules, conversion latency (~10–15s expected).

### Phase 4: Final Adoption & ROI Decision
- [ ] Compare quality vs speed trade-offs.
- [ ] Bind approved `gpt-oss` subagents to git pre-commit hooks or `/handoff` automation steps.

---

## 6. Summary of Expected Benefits

1. **Token Quota Conservation**: Reserve cloud API quota for complex reasoning (`/advisor`) and live web research.
2. **Air-Gapped Privacy**: 100% local inspection of internal scripts and private codebase changes.
3. **Automated Pre-Commit Hooks**: Run instant, zero-cost code reviews on every save/commit without rate limits.

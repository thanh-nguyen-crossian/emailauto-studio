# Windows Machine Setup Guide
_EmailAuto full environment replication_

---

## What This Guide Covers
1. Git + SSH key setup for GitHub
2. Claude Code CLI installation
3. Plugin installation (superpowers, superpowers-lab, claude-video-vision)
4. EmailAuto project clone
5. Python environment for agents

---

## Step 1 — Install Git for Windows

1. Download from **https://git-scm.com/download/win** — choose the 64-bit installer
2. During install, accept defaults EXCEPT:
   - **Default editor**: change to VS Code if installed
   - **Line ending conversions**: choose "Checkout as-is, commit as-is" (LF)
3. Open **Git Bash** (installed with Git) for all commands below

Configure your identity:
```bash
git config --global user.name "Son Nguyen"
git config --global user.email "son.nln@crossian.com"
git config --global core.autocrlf false
```

---

## Step 2 — Generate SSH Key for GitHub

Open **Git Bash** and run:
```bash
mkdir -p ~/.ssh
ssh-keygen -t ed25519 -C "son.nln@crossian.com" -f ~/.ssh/id_ed25519 -N ""
```

Add GitHub to known hosts:
```bash
ssh-keyscan -H github.com >> ~/.ssh/known_hosts
```

Create SSH config:
```bash
cat > ~/.ssh/config << 'EOF'
Host github.com
  HostName github.com
  User git
  IdentityFile ~/.ssh/id_ed25519
  AddKeysToAgent yes
EOF
```

Set permissions:
```bash
chmod 600 ~/.ssh/id_ed25519
chmod 644 ~/.ssh/id_ed25519.pub
```

Copy the public key:
```bash
cat ~/.ssh/id_ed25519.pub
```

Add this key to GitHub:
1. Go to **https://github.com/settings/ssh/new**
2. Title: `Windows EmailAuto`
3. Key type: `Authentication Key`
4. Paste the key

Test the connection:
```bash
ssh -T git@github.com
# Expected: Hi sonnln-eng! You've successfully authenticated...
```

---

## Step 3 — Install Node.js (required for Claude Code)

1. Download **Node.js LTS** from **https://nodejs.org**
2. Run the installer (accept all defaults)
3. Verify in a new terminal:
```bash
node --version    # should show v20.x or higher
npm --version
```

---

## Step 4 — Install Claude Code CLI

Open **PowerShell** or **Command Prompt** as Administrator:
```bash
npm install -g @anthropic-ai/claude-code
```

Verify:
```bash
claude --version
```

Login to Claude:
```bash
claude login
```
This opens a browser for authentication. Complete the login flow.

---

## Step 5 — Install Plugins

After Claude Code is installed, open a terminal (PowerShell or Git Bash):

```bash
# Install superpowers (choose marketplace source — skip official to avoid the duplicate)
claude plugins install superpowers@superpowers-marketplace --scope user

# Install superpowers-lab
claude plugins install superpowers-lab@superpowers-marketplace --scope user

# Install claude-video-vision
claude plugins install claude-video-vision@claude-video-vision --scope user
```

Verify all plugins are installed:
```bash
claude plugins list
```

Expected output:
```
❯ claude-video-vision@claude-video-vision  v1.2.0  user  ✔ enabled
❯ superpowers-lab@superpowers-marketplace  v0.4.0  user  ✔ enabled
❯ superpowers@superpowers-marketplace      v5.1.0  user  ✔ enabled
```

**Note**: Install only `superpowers@superpowers-marketplace` — NOT `superpowers@claude-plugins-official`. The Mac currently has both installed (they are identical at v5.1.0), which is the duplicate that needs cleanup.

---

## Step 6 — Clone the EmailAuto Project

```bash
# Navigate to your preferred directory
cd ~/Documents   # or wherever you keep projects

# Clone via SSH
git clone git@github.com:sonnln-eng/emailauto.git EmailAuto

cd EmailAuto
```

Verify the structure:
```bash
ls
# Should show: CLAUDE.md  README.md  Source/  agents/  configs/  data/  docs/  studio/  tests/
```

---

## Step 7 — Set Up Python Environment (for Agents)

Install Python 3.11+ from **https://python.org/downloads** (check "Add to PATH" during install).

In the EmailAuto directory (Git Bash or PowerShell):
```bash
# Create virtual environment
python -m venv .venv

# Activate (PowerShell)
.\.venv\Scripts\Activate.ps1

# Activate (Git Bash)
source .venv/Scripts/activate

# Install dependencies
pip install anthropic pandas numpy sendgrid
```

Set your API keys:
```bash
# PowerShell — set for current session
$env:ANTHROPIC_API_KEY = "your-key-here"
$env:SENDGRID_API_KEY = "your-key-here"

# Or create a .env file (never commit this)
echo "ANTHROPIC_API_KEY=your-key-here" >> .env
echo "SENDGRID_API_KEY=your-key-here" >> .env
```

---

## Step 8 — Install VS Code + Extensions (Optional but Recommended)

1. Download VS Code from **https://code.visualstudio.com**
2. Install the **Claude Code extension** from the VS Code marketplace (search "Claude Code")
3. Open the project: `code .` from inside the EmailAuto folder

---

## Step 9 — Clean Up Mac's Duplicate Plugin (Run on Mac)

The Mac currently has `superpowers` installed from two sources. Run this on your Mac (not Windows) to remove the duplicate:

```bash
claude plugins uninstall "superpowers@claude-plugins-official"
```

After this, `claude plugins list` on Mac should show:
```
❯ claude-video-vision@claude-video-vision  v1.2.0  project  ✔ enabled
❯ superpowers-lab@superpowers-marketplace  v0.4.0  user     ✔ enabled
❯ superpowers@superpowers-marketplace      v5.1.0  project  ✔ enabled
```

---

## Final Verification Checklist

Run these in Git Bash on Windows to confirm everything works:

```bash
# Git identity
git config user.name && git config user.email

# GitHub SSH
ssh -T git@github.com

# Claude Code
claude --version

# Plugins
claude plugins list

# Python + deps
python -c "import anthropic, pandas, numpy; print('OK')"

# Project
ls ~/Documents/EmailAuto/agents/analytics/skills/
# Should show 10 files (5 .md + 5 .py)
```

---

## Skill Counts Per Agent (Post-Setup)

Both agents now have exactly **5 skills each**:

| Agent | Skill | Purpose |
|---|---|---|
| analytics | `kpi_compute` | Computes CBH/Delivered, Access/Delivered, optout/spam from CSV exports |
| analytics | `anomaly_detect` | Flags >2σ deviations per metric per brand with severity tiers |
| analytics | `rfm_track` | Tracks segment migration (Loyal → At Risk etc.) + health score |
| analytics | `flow_monitor` | Welcome flow MPP suppression + winback/campaign overlap detection |
| analytics | `report_generate` | Claude API narrative weekly report → Slack/email/file |
| automation | `segment_route` | RFM → tier mapping with all exclusion rules applied |
| automation | `copy_generate` | Claude API email copy (1 call/tier, all product types per call) |
| automation | `preflight_check` | Quality gate: subject length, banned patterns, color, product count |
| automation | `campaign_schedule` | SendGrid campaign creation + scheduling |
| automation | `draft_archive` | Archives every campaign to data/processed/ for analytics cross-reference |

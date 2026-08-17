# Guide: Transferring or Mirroring Day Planner to GSA Enterprise GitHub

This guide outlines how to transfer, clone, or dual-publish your **Day Planner** repository to your **GSA Enterprise (`gsa.gov`) GitHub Organization** with Private GitHub Pages enabled.

---

## Method 1: Dual-Remote Workflow (Recommended)
Keep your current origin and add a new `gsa` remote so you can push updates to both destinations with a single command.

### Step 1: Create an Empty Private Repository on GSA GitHub
1. Log in to your GSA Enterprise GitHub account (`github.com/GSA` or your agency org).
2. Create a new repository named `day-planner` (Set visibility to **Private**).
3. Do **not** initialize with a README, .gitignore, or license (keep it empty).

### Step 2: Add the GSA Remote in Local Terminal
```bash
# Add the GSA remote (replace with your exact GSA repo URL):
git remote add gsa git@github.com:GSA/day-planner.git
# Or via HTTPS:
# git remote add gsa https://github.com/GSA/day-planner.git

# Verify remotes
git remote -v
```

### Step 3: Push All Branches and Tags to GSA
```bash
# Push master branch to GSA Enterprise
git push -u gsa master

# Push all tags
git push gsa --tags
```

### Step 4: Configure Dual-Push (Optional)
To automatically push to both `origin` and `gsa` when running `git push`:
```bash
git remote set-url --add --push origin https://github.com/mhoffman02/day-planner
git remote set-url --add --push origin git@github.com:GSA/day-planner.git
```

---

## Method 2: Standalone Full Git Mirror Clone
If you want to migrate completely to GSA GitHub without linking to the personal remote:

```bash
# 1. Make a bare clone of the repository
git clone --bare https://github.com/mhoffman02/day-planner.git day-planner-bare

# 2. Push as mirror to your GSA enterprise repository
cd day-planner-bare
git push --mirror git@github.com:GSA/day-planner.git

# 3. Clean up the temporary bare clone
cd ..
rm -rf day-planner-bare
```

---

## Method 3: GitHub UI Repository Transfer
If you want GitHub to automatically transfer ownership, issues, and commit history from your personal account to the GSA organization:

1. Open your personal repository on GitHub: `https://github.com/mhoffman02/day-planner`
2. Go to **Settings** $\to$ Scroll to the bottom to the **Danger Zone**.
3. Click **Transfer ownership**.
4. Enter the target GSA Organization name (e.g. `GSA`) and confirm.

---

## Post-Migration: Enabling Private GitHub Pages on GSA

1. Open your newly migrated repository on GSA Enterprise GitHub.
2. Go to **Settings** $\to$ **Pages**.
3. Under **Build and deployment**:
   - Source: **Deploy from a branch**
   - Branch: `master` / `/ (root)`
4. Under **Pages visibility**:
   - Select **Private** *(Restricted to members/collaborators with repository access)*.
5. Under **Collaborators and teams**:
   - Invite your team members or colleagues with **Read** access.
6. Access your secure, private PWA:
   - `https://<gsa-org>.github.io/day-planner/`
   - Native Service Worker (`sw.js`) and offline PWA installation will activate automatically.

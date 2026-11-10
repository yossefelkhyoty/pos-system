# GitHub Setup Guide

## Basic Steps

### 1. Create a New Repository on GitHub

1. Go to [GitHub](https://github.com)
2. Click the **"New"** or **"+"** button in the top right corner
3. Fill in the details:
   - **Repository name**: `financial-tracker` (or any name you prefer)
   - **Description**: "Financial Management System built with Electron"
   - Choose **Private** or **Public** as you prefer
   - **Do NOT** check "Initialize this repository with a README"
4. Click **"Create repository"**

### 2. Install Git (if not already installed)

```bash
# Check if Git is installed
git --version

# If not installed, download from:
# https://git-scm.com/downloads
```

### 3. Initialize Git in Your Project

Open Terminal in your project folder and run:

```bash
# Navigate to project folder
cd "D:\0)Projects\app"

# Initialize Git
git init

# Add all files
git add .

# Make initial commit
git commit -m "Initial commit: Financial Tracker project"
```

### 4. Add Remote Repository

```bash
# Replace YOUR_USERNAME and REPOSITORY_NAME with your values
git remote add origin https://github.com/YOUR_USERNAME/REPOSITORY_NAME.git

# Example:
# git remote add origin https://github.com/youssef/financial-tracker.git
```

### 5. Push to GitHub

```bash
# Push project to GitHub
git branch -M main
git push -u origin main
```

## Complete Commands (Copy & Paste)

```bash
# 1. Initialize Git
git init

# 2. Add all files
git add .

# 3. Make commit
git commit -m "Initial commit: Financial Tracker project"

# 4. Add remote (replace values)
git remote add origin https://github.com/YOUR_USERNAME/REPOSITORY_NAME.git

# 5. Push to GitHub
git branch -M main
git push -u origin main
```

## Updating the Project Later

When you make new changes:

```bash
# Add changes
git add .

# Make commit
git commit -m "Description of your changes"

# Push changes
git push
```

## Important Tips

### 1. .gitignore File

Make sure you have a `.gitignore` file (already exists) to protect:
- `node_modules/`
- `.env` (API keys)
- `*.db` (database files)
- Build files

### 2. .env File

**Very Important**: Do NOT push `.env` file to GitHub as it contains secret API keys.

### 3. Database

Do NOT push `pos_system.db` to GitHub. Users can create it automatically.

## Troubleshooting

### Error: "remote origin already exists"

```bash
# Remove old remote
git remote remove origin

# Add new remote
git remote add origin https://github.com/YOUR_USERNAME/REPOSITORY_NAME.git
```

### Error: "Authentication failed"

```bash
# Use Personal Access Token instead of password
# Or use GitHub CLI
gh auth login
```

### Error: "Large files"

```bash
# If you have large files, use Git LFS
git lfs install
git lfs track "*.db"
git add .gitattributes
```

## Using GitHub CLI (Easiest Method)

### Install GitHub CLI

```bash
# Windows (using Chocolatey)
choco install gh

# Or download from: https://cli.github.com/
```

### Using GitHub CLI

```bash
# Login
gh auth login

# Create new repository and push project
gh repo create financial-tracker --public --source=. --remote=origin --push
```

## Adding Additional Information

### 1. Add License

```bash
# Create LICENSE file
# You can use: https://choosealicense.com/
```

### 2. Add Badges (Optional)

You can add badges in README.md:

```markdown
![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D16.0.0-brightgreen.svg)
```

### 3. Add Topics

On the repository page on GitHub:
- Click **⚙️ Settings**
- Go to **Topics**
- Add: `electron`, `sqlite`, `financial-management`, `javascript`

## Verify Success

After pushing, make sure:
1. ✅ All files are on GitHub
2. ✅ README.md displays correctly
3. ✅ `.env` file is NOT present (protected by .gitignore)
4. ✅ `node_modules/` is NOT present

## Security

### Before pushing, make sure:

- [ ] `.env` file is in `.gitignore`
- [ ] No API keys in code
- [ ] Database not uploaded
- [ ] Build files in `.gitignore`

---

**Note**: If you're using GitHub for the first time, you may need to create a Personal Access Token instead of using your password.


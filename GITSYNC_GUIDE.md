# Git Sync Quick Reference

## ✅ Setup Complete!

The `gitsync` function has been added to your `~/.bashrc` file.

## Usage

### Basic Sync (with automatic timestamp)
```bash
cd /mnt/c/AxeBench_Build/axebench-matrix-ui
gitsync
```
This will:
1. Stage all changes (`git add .`)
2. Commit with timestamp message: "Auto-sync: 2024-12-01 08:45:30"
3. Push to GitHub (`git push`)

### Sync with Custom Message
```bash
gitsync "Fixed device loading bug"
gitsync "Added comprehensive logging system"
gitsync "Updated documentation"
```
This will use your custom message instead of the timestamp.

## Examples

```bash
# Quick sync after making changes
cd /mnt/c/AxeBench_Build/axebench-matrix-ui
gitsync

# Sync with descriptive message
gitsync "Implemented real-time device monitoring"

# Sync after fixing a bug
gitsync "Fixed: Devices now show ONLINE status correctly"

# Sync after adding a feature
gitsync "Added: PSU management interface"
```

## What Gets Synced?

The `gitsync` function stages **all changes** in your working directory:
- Modified files
- New files
- Deleted files

If you want to sync only specific files, use regular git commands:
```bash
git add specific-file.ts
git commit -m "Your message"
git push
```

## Checking Status Before Sync

```bash
# See what will be synced
git status

# See specific changes
git diff
```

## Troubleshooting

### "Nothing to commit"
This means there are no changes to sync. The function will exit gracefully.

### "Permission denied"
Your GitHub credentials may have expired. Re-authenticate:
```bash
gh auth login
```

### "Diverged branches"
If remote has changes you don't have locally:
```bash
git pull --rebase
gitsync
```

## Your GitHub Repository

**URL:** https://github.com/WillItMod/axebench-matrix-ui

**Branch:** main (default)

## Activating in New Terminal Sessions

The alias is automatically available in new terminal sessions because it's in `~/.bashrc`.

If you need to reload it in the current session:
```bash
source ~/.bashrc
```

## Removing the Alias

If you ever want to remove it:
```bash
# Edit .bashrc and remove the gitsync function
nano ~/.bashrc

# Or use sed to remove it
sed -i '/# AxeBench Matrix UI - Quick Git Sync Alias/,/^}$/d' ~/.bashrc
```

## Best Practices

1. **Sync frequently** - Don't let changes pile up
2. **Use descriptive messages** - Help your future self understand what changed
3. **Check status first** - Run `git status` to see what you're about to sync
4. **Pull before sync** - If working across multiple machines, pull first to avoid conflicts

## Advanced: Sync Multiple Projects

Create project-specific aliases in `~/.bashrc`:

```bash
alias axesync='cd /mnt/c/AxeBench_Build/axebench-matrix-ui && gitsync'
alias othersync='cd /path/to/other/project && gitsync'
```

Then from anywhere:
```bash
axesync "Updated dashboard"
```

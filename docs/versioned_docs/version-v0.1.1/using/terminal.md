---
sidebar_position: 5
---

# Terminal

The **Terminal** page runs shell commands on the Jetson from the browser, with tab
completion and command history.

On the installed service, commands run as the **`jdboard`** user: it can see JDBoard's
files but not your home folder, and has no root access. Commands that could wipe the
system (for example `rm -rf /` or `mkfs`) are refused.

:::caution
The terminal is the most powerful part of the dashboard. Keep the login strong, and
[don't expose JDBoard to the internet](../security.md). API keys can never use the
terminal, whatever their scope.
:::

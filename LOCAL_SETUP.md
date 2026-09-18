# Local Setup (Portable Node.js, No Install)

If you don't have Node.js/npm installed system-wide, this repo can use a
portable copy instead, downloaded into `.tools/node` (gitignored, not
committed).

This repo requires Node `>=24.15.0` and npm `>=11.16.0` (see `engines` in
[package.json](package.json)).

## One-time setup

Download the portable Node.js build for your platform and extract it into
`.tools/node` at the repo root, so that `.tools/node/node.exe` (Windows) or
`.tools/node/bin/node` (macOS/Linux) exists.

Example for Windows x64:

```sh
curl -L -o node.zip https://nodejs.org/dist/v24.21.0/node-v24.21.0-win-x64.zip
unzip node.zip -d .tools
mv .tools/node-v24.21.0-win-x64 .tools/node
rm node.zip
```

## Every new terminal session

Pick the script matching your shell. All three just prepend `.tools/node`
to `PATH` for the current session — none of them install anything
system-wide or touch your global `PATH`.

Because setting `PATH` only affects the process it runs in, each script
must be run in a way that applies the change to your _current_ shell, not
a child process it spawns. Running them the "normal" way silently does
nothing useful once the script exits.

| Shell                    | File                           | Correct way to run it                           |
| ------------------------ | ------------------------------ | ----------------------------------------------- |
| PowerShell               | [setup-env.ps1](setup-env.ps1) | `. .\setup-env.ps1` (dot-source it)             |
| Command Prompt (cmd.exe) | [setup-env.bat](setup-env.bat) | `setup-env.bat` (run directly, not via `start`) |
| Git Bash / mingw64       | [setup-env.sh](setup-env.sh)   | `source ./setup-env.sh`                         |

⚠️ **Common mistake:** running `.\setup-env.ps1` (no leading `. `) in
PowerShell, `.\setup-env.bat` from _inside_ PowerShell, or
`./setup-env.sh` (no `source`) in Git Bash all run the script in a
subprocess. You'll see the version numbers print correctly, but `node`
and `npm` will still be "not found" right after — because the `PATH`
change died with that subprocess.

After running the correct form, verify with:

```sh
node --version   # v24.21.0
npm --version    # 11.19.0
```

Then proceed as usual:

```sh
npm run bootstrap
npm run start
```

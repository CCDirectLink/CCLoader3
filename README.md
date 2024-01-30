# CCLoader3

[![CI Status](https://github.com/CCDirectLink/CCLoader3/workflows/CI/badge.svg)](https://github.com/CCDirectLink/CCLoader3/actions?query=workflow:CI)

A temporary repository for _The Third Version of
[CCLoader](https://github.com/CCDirectLink/CCLoader)_. Project is currently under construction. I
promise, **there will be documentation here**.

**Precompiled builds can be downloaded from:**
https://stronghold.openkrosskod.org/~dmitmel/ccloader3/

## Building from source

```bash
npm i -g pnpm
cd /somewhere/but/preferably/inside/the/crosscode/directory
git clone https://github.com/CCDirectLink/CCLoader3.git ccloader3
cd ccloader3
pnpm install
pnpm build
```

Then edit the game's `package.json` and point the path in the `main` field to the location of the
`main.html` page in the `ccloader3` directory.

## Attribution

CCLoader3 was written by [dmitmel](https://github.com/dmitmel). All work up until
[this commit](https://github.com/CCDirectLink/CCLoader3/tree/9646ae3c68057ce6babf400afd40a392562586bd)
was done by him.

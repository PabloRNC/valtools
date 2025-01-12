FROM oven/bun:1 AS base
WORKDIR /ubuntu/valtools

RUN useradd -ms /bin/bash ubuntu

FROM base AS install
RUN mkdir -p /temp/dev
COPY package.json bun.lockb /temp/dev/
RUN cd /temp/dev && bun install --frozen-lockfile

RUN mkdir -p /temp/prod
COPY package.json bun.lockb /temp/prod/
RUN cd /temp/prod && bun install --frozen-lockfile --production

FROM base AS prerelease
COPY --from=install /temp/dev/node_modules node_modules
COPY . /ubuntu/valtools
COPY .env .

ENV NODE_ENV=production

FROM base AS release
COPY --from=install /temp/prod/node_modules node_modules
COPY --from=prerelease /ubuntu/valtools .

USER ubuntu
EXPOSE 8080/tcp
ENTRYPOINT [ "bun", "run", "src/index.ts" ]

import { app } from "./app"

const SERVICE_PORT = 3107

export const server = Bun.serve({
  port: getServicePort(),
  fetch: app.fetch,
})

console.info(`ocs-llm-solver listening on ${server.url}`)

type ServiceEnv = {
  readonly [key: string]: string | undefined
  readonly OCS_SERVICE_PORT?: string
  readonly PORT?: string
}

function getServicePort(env: ServiceEnv = Bun.env): number {
  const configuredPort = env.OCS_SERVICE_PORT ?? env.PORT
  const parsedPort = Number(configuredPort)

  if (Number.isInteger(parsedPort) && parsedPort > 0 && parsedPort <= 65_535) {
    return parsedPort
  }

  return SERVICE_PORT
}

import { Body, Controller, Inject, Post, Req, Res, UseGuards } from "@nestjs/common";
import { agentRouteRequestSchema, directorScriptRequestSchema, type AgentRouteRequest, type AgentRouteResponse, type DirectorScriptRequest } from "@ds/contracts";
import { AccessTokenGuard, type AuthenticatedRequest } from "../auth/access-token.guard.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { AgentService } from "./agent.service.js";

@Controller("agent")
@UseGuards(AccessTokenGuard)
export class AgentController {
  constructor(@Inject(AgentService) private readonly agentService: AgentService) {}

  @Post("route")
  route(@Req() request: AuthenticatedRequest, @Body(new ZodValidationPipe(agentRouteRequestSchema)) input: AgentRouteRequest): Promise<AgentRouteResponse> {
    return this.agentService.route(request.auth.userId, input);
  }

  @Post("director/script")
  directorScript(@Req() request: AuthenticatedRequest, @Body(new ZodValidationPipe(directorScriptRequestSchema)) input: DirectorScriptRequest) {
    return this.agentService.createDirectorScript(request.auth.userId, input);
  }

  @Post("route/stream")
  async routeStream(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(agentRouteRequestSchema)) input: AgentRouteRequest,
    @Res() response: { setHeader(name: string, value: string): void; write(chunk: string): void; end(): void },
  ): Promise<void> {
    const result = await this.agentService.route(request.auth.userId, input);
    response.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
    response.setHeader("Cache-Control", "no-cache, no-transform");
    response.setHeader("X-Accel-Buffering", "no");
    for (const character of result.reply) {
      response.write(`${JSON.stringify({ type: "delta", text: character })}\n`);
      await new Promise((resolve) => setTimeout(resolve, 12));
    }
    response.write(`${JSON.stringify({ type: "result", data: result })}\n`);
    response.end();
  }
}

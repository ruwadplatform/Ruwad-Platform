import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { AppModule } from "./app.module";
import { RejectNulBytesPipe, rejectMalformedUrls, resolveTrustProxyHops } from "./common/request-hygiene";

async function bootstrap() {
  // rawBody keeps a copy of each request's exact bytes on the request (req.rawBody) so Daily's webhook signature can be verified; parsing is unchanged.
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const config = app.get(ConfigService);

  // Helmet's default Cross-Origin-Resource-Policy is "same-origin", which
  // silently blocks the browser from reading any response to this API from
  // a different origin — including the frontend's own legitimate fetches,
  // since it's a separate Render service/domain by design. This is a
  // browser-enforced header, independent of CORS: the CORS preflight and
  // Access-Control-Allow-Origin can be perfectly correct and the request
  // still gets blocked client-side because of this. Every other Helmet
  // default (CSP, HSTS, COOP, etc.) stays as-is.
  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
  // Behind Render's proxy the visitor's address arrives in X-Forwarded-For. Without this every request is counted against the balancer's own address
  // and the per-IP rate limit (100/min) is shared by ALL visitors; with it, each visitor gets their own allowance.
  const proxyHops = resolveTrustProxyHops({ TRUST_PROXY_HOPS: config.get("TRUST_PROXY_HOPS"), NODE_ENV: config.get("NODE_ENV") });
  if (proxyHops > 0) (app.getHttpAdapter().getInstance() as { set: (k: string, v: unknown) => void }).set("trust proxy", proxyHops);
  app.use(rejectMalformedUrls);
  app.use(cookieParser());
  app.setGlobalPrefix("api");
  app.useGlobalPipes(
    new RejectNulBytesPipe(),
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const frontendUrl: string = config.get("FRONTEND_URL") ?? "http://localhost:5174";
  app.enableCors({
    origin: frontendUrl.split(",").map((s: string) => s.trim()),
    credentials: true,
  });

  if (config.get("NODE_ENV") !== "production") {
    const swaggerConfig = new DocumentBuilder()
      .setTitle("RUWĀD API")
      .setDescription("RUWĀD platform backend — startups, investors, hubs, research, multinationals, workspace and intelligence APIs.")
      .setVersion("0.1.0")
      .addCookieAuth("ruwad_token")
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup("api/docs", app, document);
  }

  const port = config.get("PORT") ?? 4000;
  // Explicit 0.0.0.0 bind — Render (and most container/PaaS hosts) reach
  // the process over its internal network interface, not loopback; the
  // default host Node picks without an explicit argument already covers
  // this, but binding it explicitly removes any doubt.
  await app.listen(port, "0.0.0.0");
  // eslint-disable-next-line no-console
  console.log(`RUWĀD API listening on port ${port}`);
}
bootstrap();

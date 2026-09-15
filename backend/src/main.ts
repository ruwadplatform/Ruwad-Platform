import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
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
  app.use(cookieParser());
  app.setGlobalPrefix("api");
  app.useGlobalPipes(
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

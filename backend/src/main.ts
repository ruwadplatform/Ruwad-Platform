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

  app.use(helmet());
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
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`RUWĀD API listening on http://localhost:${port}/api`);
}
bootstrap();

import { PartialType } from "@nestjs/swagger";
import { CreateStartupDto } from "./create-startup.dto";

export class UpdateStartupDto extends PartialType(CreateStartupDto) {}

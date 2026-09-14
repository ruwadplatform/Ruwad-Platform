import { PartialType } from "@nestjs/swagger";
import { CreateMultinationalDto } from "./create-multinational.dto";

export class UpdateMultinationalDto extends PartialType(CreateMultinationalDto) {}

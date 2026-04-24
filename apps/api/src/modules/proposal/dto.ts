import { ApiProperty } from "@nestjs/swagger";
import { IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength, Min } from "class-validator";

/**
 * ADR-0006 C2 — 제안 생성 요청 body.
 *
 * proposedText 상한은 5,000자 (세그먼트 단위 문장치고 넉넉). reason는 500자.
 * 빈 문자열/공백-only는 서비스 레이어 trim 후 거부.
 */
export class CreateProposalBody {
  @ApiProperty({ description: "대상 세그먼트 UUID." })
  @IsUUID()
  segmentId!: string;

  @ApiProperty({
    description:
      "제안 작성 시점의 현재 translation_segments.version. 머지 시 optimistic lock " +
      "체크(ADR-0003)에 사용된다.",
  })
  @IsInt()
  @Min(0)
  baseSegmentVersion!: number;

  @ApiProperty({ description: "제안하는 번역 텍스트. 1–5000자.", maxLength: 5000 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  proposedText!: string;

  @ApiProperty({ description: "제안 사유(선택). 500자 이내.", maxLength: 500, required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

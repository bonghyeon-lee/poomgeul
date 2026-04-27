import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";

/**
 * §5 세그먼트 에디터 — 리드 직접 편집 body.
 *
 * ADR은 expected_version을 `If-Match` 헤더로 전달하도록 명시했으므로
 * body에는 넣지 않는다(중복 원천 방지). proposedText 상한은 Proposal과 동일한 5000자.
 */
export class EditSegmentBody {
  @ApiProperty({ description: "새 번역 텍스트. 1–5000자.", maxLength: 5000 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  text!: string;

  @ApiProperty({
    description: "편집 사유·메모(선택). translation_revisions.commit_message에 저장.",
    maxLength: 500,
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  commitMessage?: string;
}

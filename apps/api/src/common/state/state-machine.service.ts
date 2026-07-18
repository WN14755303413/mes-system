import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ErrorCode,
  RECORD_STATUS_LABEL,
  RECORD_STATUS_TRANSITIONS,
  type RecordStatus,
} from '@mes/shared';
import { AppException } from '../exceptions/app.exception';

/**
 * 通用状态机（建设方案 §10.3）。
 *
 * 唯一依据是 shared 里的 RECORD_STATUS_TRANSITIONS —— 前后端共享同一张跃迁表，
 * 前端据此禁用非法的状态按钮，后端在此做强校验。非法跃迁一律拒绝，
 * 不信任前端传来的目标状态。
 *
 * 后续 BOM 版本、工单等凡是走「草稿→已发布→…」流程的对象都复用本服务。
 */
@Injectable()
export class StateMachineService {
  /** 校验一次状态跃迁是否合法，非法则抛 ILLEGAL_STATE_TRANSITION。 */
  assertTransition(from: RecordStatus, to: RecordStatus): void {
    if (from === to) {
      throw new AppException(
        ErrorCode.ILLEGAL_STATE_TRANSITION,
        `状态已是「${RECORD_STATUS_LABEL[to]}」，无需变更`,
        HttpStatus.BAD_REQUEST,
      );
    }
    const allowed = RECORD_STATUS_TRANSITIONS[from] ?? [];
    if (!allowed.includes(to)) {
      throw new AppException(
        ErrorCode.ILLEGAL_STATE_TRANSITION,
        `不允许从「${RECORD_STATUS_LABEL[from]}」变更为「${RECORD_STATUS_LABEL[to]}」`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /** 某状态下允许跃迁到的目标状态列表，供前端渲染可选操作。 */
  nextStates(from: RecordStatus): RecordStatus[] {
    return RECORD_STATUS_TRANSITIONS[from] ?? [];
  }
}

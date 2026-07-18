import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ErrorCode,
  RECORD_STATUS_LABEL,
  RECORD_STATUS_TRANSITIONS,
  type RecordStatus,
} from '@mes/shared';
import { AppException } from '../exceptions/app.exception';

/**
 * 状态机校验（建设方案 §10.3）。
 *
 * 唯一依据是 shared 里的跃迁表 —— 前后端共享同一张表，前端据此禁用非法的
 * 状态按钮，后端在此做强校验。非法跃迁一律拒绝，不信任前端传来的目标状态。
 *
 * 通用对象（项目、工单等）用 assertTransition / nextStates（RecordStatus）；
 * 有独立生命周期的对象（如 M5 的 BOM 版本）用 assertTransitionIn 传入自己的跃迁表。
 */
@Injectable()
export class StateMachineService {
  /** 按给定跃迁表校验一次状态跃迁，非法则抛 ILLEGAL_STATE_TRANSITION。 */
  assertTransitionIn<S extends string>(
    transitions: Record<S, readonly S[]>,
    labels: Record<S, string>,
    from: S,
    to: S,
  ): void {
    if (from === to) {
      throw new AppException(
        ErrorCode.ILLEGAL_STATE_TRANSITION,
        `状态已是「${labels[to]}」，无需变更`,
        HttpStatus.BAD_REQUEST,
      );
    }
    const allowed = transitions[from] ?? [];
    if (!allowed.includes(to)) {
      throw new AppException(
        ErrorCode.ILLEGAL_STATE_TRANSITION,
        `不允许从「${labels[from]}」变更为「${labels[to]}」`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /** 校验通用状态机（RecordStatus）的一次跃迁。 */
  assertTransition(from: RecordStatus, to: RecordStatus): void {
    this.assertTransitionIn(RECORD_STATUS_TRANSITIONS, RECORD_STATUS_LABEL, from, to);
  }

  /** 某状态下允许跃迁到的目标状态列表，供前端渲染可选操作。 */
  nextStates(from: RecordStatus): RecordStatus[] {
    return RECORD_STATUS_TRANSITIONS[from] ?? [];
  }
}

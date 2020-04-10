/**
 * ItemResizing plugin
 *
 * @copyright Rafal Pospiech <https://neuronet.io>
 * @author    Rafal Pospiech <neuronet.io@gmail.com>
 * @package   gantt-schedule-timeline-calendar
 * @license   AGPL-3.0 (https://github.com/neuronetio/gantt-schedule-timeline-calendar/blob/master/LICENSE)
 * @link      https://github.com/neuronetio/gantt-schedule-timeline-calendar
 */

import { Vido, Wrapper, htmlResult, Item, DataChartTime } from '../gstc';
import DeepState from 'deep-state-observer';
import { Api, getClass } from '../api/api';
import { lithtml } from '@neuronet.io/vido/vido';
import { Point, ITEM } from './timeline-pointer.plugin';

export interface Handle {
  width?: number;
  horizontalMargin?: number;
  verticalMargin?: number;
  outside?: boolean;
  onlyWhenSelected?: boolean;
}

export interface ItemInitial {
  id: string;
  left: number;
  width: number;
}

export interface Options {
  enabled?: boolean;
  handle?: Handle;
  content?: htmlResult;
  bodyClass?: string;
  bodyClassLeft?: string;
  bodyClassRight?: string;
}

export interface PluginData extends Options {
  leftIsMoving: boolean;
  rightIsMoving: boolean;
  itemsInitial: ItemInitial[];
  initialPosition: Point;
  currentPosition: Point;
  movement: number;
}

const lineClass = getClass('chart-timeline-items-row-item-resizing-handle-content-line');

function generateEmptyData(options: Options = {}): PluginData {
  const result = {
    enabled: true,
    handle: {
      width: 18,
      horizontalMargin: 0,
      verticalMargin: 0,
      outside: false,
      onlyWhenSelected: true,
    },
    content: null,
    bodyClass: 'gstc-item-resizing',
    bodyClassLeft: 'gstc-items-resizing-left',
    bodyClassRight: 'gstc-items-resizing-right',
    initialPosition: { x: 0, y: 0 },
    currentPosition: { x: 0, y: 0 },
    movement: 0,
    itemsInitial: [],
    leftIsMoving: false,
    rightIsMoving: false,
    ...options,
  };
  if (options.handle) result.handle = { ...result.handle, ...options.handle };
  return result;
}

class ItemResizing {
  private vido: Vido;
  private state: DeepState;
  private api: Api;
  private data: PluginData;
  private oldWrapper: Wrapper;
  private html: typeof lithtml.html;
  private leftClassName: string;
  private rightClassName: string;
  private spacing: number = 1;
  private unsubs: (() => void)[] = [];
  private minWidth: number;

  constructor(vido: Vido, options: Options) {
    this.vido = vido;
    this.state = vido.state;
    this.api = vido.api;
    this.data = generateEmptyData(options);
    this.minWidth = this.data.handle.width * 2;
    this.state.update('config.chart.item.minWidth', this.minWidth);
    this.state.update('config.chart.items.*.minWidth', this.minWidth);
    this.html = vido.html;
    if (!this.data.content) this.data.content = this.html`<div class=${lineClass}></div><div class=${lineClass}></div>`;
    this.wrapper = this.wrapper.bind(this);
    this.onRightPointerDown = this.onRightPointerDown.bind(this);
    this.onRightPointerMove = this.onRightPointerMove.bind(this);
    this.onRightPointerUp = this.onRightPointerUp.bind(this);
    this.onLeftPointerDown = this.onLeftPointerDown.bind(this);
    this.onLeftPointerMove = this.onLeftPointerMove.bind(this);
    this.onLeftPointerUp = this.onLeftPointerUp.bind(this);
    this.updateData();
    document.body.classList.add(this.data.bodyClass);
    this.unsubs.push(
      this.state.subscribe('config.plugin.ItemResizing', (data) => {
        if (!data.enabled) {
          document.body.classList.remove(this.data.bodyClass);
        } else if (data.enabled) {
          document.body.classList.add(this.data.bodyClass);
        }
        this.data = data;
      })
    );
    document.addEventListener('pointermove', this.onLeftPointerMove);
    document.addEventListener('pointerup', this.onLeftPointerUp);
    document.addEventListener('pointermove', this.onRightPointerMove);
    document.addEventListener('pointerup', this.onRightPointerUp);
  }

  public destroy() {
    this.unsubs.forEach((unsub) => unsub());
    document.removeEventListener('pointermove', this.onLeftPointerMove);
    document.removeEventListener('pointerup', this.onLeftPointerUp);
    document.removeEventListener('pointermove', this.onRightPointerMove);
    document.removeEventListener('pointerup', this.onRightPointerUp);
  }

  private updateData() {
    this.state.update('config.plugin.ItemResizing', this.data);
  }

  private initializeWrapper() {
    this.leftClassName = this.api.getClass('chart-timeline-items-row-item-resizing-handle');
    this.leftClassName += ' ' + this.leftClassName + '--left';
    this.rightClassName = this.api.getClass('chart-timeline-items-row-item-resizing-handle');
    this.rightClassName += ' ' + this.rightClassName + '--right';
    this.spacing = this.state.get('config.chart.spacing');
  }

  private getSelectedItems(): Item[] {
    return this.state.get(`config.plugin.Selection.selected.${ITEM}`);
  }

  private getRightStyleMap(item: Item, visible: boolean) {
    const rightStyleMap = new this.vido.StyleMap({});
    rightStyleMap.style.top = item.$data.position.actualTop + this.data.handle.verticalMargin + 'px';
    if (this.data.handle.outside) {
      rightStyleMap.style.left = item.$data.position.right + this.data.handle.horizontalMargin - this.spacing + 'px';
    } else {
      rightStyleMap.style.left =
        item.$data.position.right - this.data.handle.width - this.data.handle.horizontalMargin - this.spacing + 'px';
    }
    rightStyleMap.style.width = this.data.handle.width + 'px';
    rightStyleMap.style.height = item.$data.actualHeight - this.data.handle.verticalMargin * 2 + 'px';
    return rightStyleMap;
  }

  private getLeftStyleMap(item: Item, visible: boolean) {
    const leftStyleMap = new this.vido.StyleMap({});
    leftStyleMap.style.top = item.$data.position.actualTop + this.data.handle.verticalMargin + 'px';
    if (this.data.handle.outside) {
      leftStyleMap.style.left =
        item.$data.position.left - this.data.handle.width - this.data.handle.horizontalMargin + 'px';
    } else {
      leftStyleMap.style.left = item.$data.position.left + this.data.handle.horizontalMargin + 'px';
    }
    leftStyleMap.style.width = this.data.handle.width + 'px';
    leftStyleMap.style.height = item.$data.actualHeight - this.data.handle.verticalMargin * 2 + 'px';
    return leftStyleMap;
  }

  private onPointerDown(ev: PointerEvent) {
    ev.preventDefault();
    ev.stopPropagation();
    this.data.itemsInitial = this.getSelectedItems().map((item: Item) => {
      return {
        id: item.id,
        left: item.$data.position.left,
        width: item.$data.width,
      };
    });
    this.data.initialPosition = {
      x: ev.screenX,
      y: ev.screenY,
    };
    this.data.currentPosition = { ...this.data.initialPosition };
  }

  private onLeftPointerDown(ev: PointerEvent) {
    if (!this.data.enabled) return;
    document.body.classList.add(this.data.bodyClassLeft);
    this.data.leftIsMoving = true;
    this.onPointerDown(ev);
    this.updateData();
  }
  private onRightPointerDown(ev: PointerEvent) {
    if (!this.data.enabled) return;
    document.body.classList.add(this.data.bodyClassRight);
    this.data.rightIsMoving = true;
    this.onPointerDown(ev);
    this.updateData();
  }

  private onPointerMove(ev: PointerEvent) {
    ev.stopPropagation();
    ev.preventDefault();
    this.data.currentPosition.x = ev.screenX;
    this.data.currentPosition.y = ev.screenY;
    this.data.movement = this.data.currentPosition.x - this.data.initialPosition.x;
  }

  private onLeftPointerMove(ev: PointerEvent) {
    if (!this.data.enabled || !this.data.leftIsMoving) return;
    this.onPointerMove(ev);
    const selected = this.getSelectedItems();
    const movement = this.data.movement;
    const time: DataChartTime = this.state.get('$data.chart.time');
    let multi = this.state.multi();
    for (let i = 0, len = selected.length; i < len; i++) {
      const item = selected[i];
      item.$data.position.left = this.data.itemsInitial[i].left + movement;
      if (item.$data.position.left > item.$data.position.right) item.$data.position.left = item.$data.position.right;
      item.$data.position.actualLeft = item.$data.position.left;
      item.$data.width = item.$data.position.right - item.$data.position.left;
      if (item.$data.width < item.minWidth) item.$data.width = item.minWidth;
      item.$data.actualWidth = item.$data.width;
      const leftGlobal = this.api.time.getTimeFromViewOffsetPx(item.$data.position.left, time);
      item.time.start = leftGlobal;
      item.$data.time.startDate = this.api.time.date(leftGlobal);
      multi = multi
        .update(`config.chart.items.${item.id}.time`, item.time)
        .update(`config.chart.items.${item.id}.$data`, item.$data);
    }
    multi.done();
    this.updateData();
  }

  private onRightPointerMove(ev: PointerEvent) {
    if (!this.data.enabled || !this.data.rightIsMoving) return;
    this.onPointerMove(ev);
    const selected = this.getSelectedItems();
    const movement = this.data.movement;
    const time: DataChartTime = this.state.get('$data.chart.time');
    let multi = this.state.multi();
    for (let i = 0, len = selected.length; i < len; i++) {
      const item = selected[i];
      item.$data.width = this.data.itemsInitial[i].width + movement;
      if (item.$data.width < item.minWidth && item.$data.width) item.$data.width = item.minWidth;
      const diff = item.$data.position.actualLeft === item.$data.position.left ? 0 : item.$data.position.left;
      item.$data.actualWidth = item.$data.width + diff;
      const right = item.$data.position.left + item.$data.width;
      item.$data.position.right = right;
      item.$data.position.actualRight = right;
      const rightGlobal = this.api.time.getTimeFromViewOffsetPx(right, time);
      item.time.end = rightGlobal;
      item.$data.time.endDate = this.api.time.date(rightGlobal);
      multi = multi
        .update(`config.chart.items.${item.id}.time`, item.time)
        .update(`config.chart.items.${item.id}.$data`, item.$data);
    }
    multi.done();
    this.updateData();
  }

  private onPointerUp(ev: PointerEvent) {
    ev.preventDefault();
    ev.stopPropagation();
  }
  private onLeftPointerUp(ev: PointerEvent) {
    if (!this.data.enabled || !this.data.leftIsMoving) return;
    document.body.classList.remove(this.data.bodyClassLeft);
    this.onPointerUp(ev);
    this.data.leftIsMoving = false;
    this.updateData();
  }
  private onRightPointerUp(ev: PointerEvent) {
    if (!this.data.enabled || !this.data.rightIsMoving) return;
    document.body.classList.remove(this.data.bodyClassRight);
    this.onPointerUp(ev);
    this.data.rightIsMoving = false;
    this.updateData();
  }

  public wrapper(input: htmlResult, props?: any): htmlResult {
    const oldContent = this.oldWrapper(input, props);
    const item: Item = props.props.item;

    let visible = !item.$data.detached;
    if (this.data.handle.onlyWhenSelected) {
      visible = visible && item.selected;
    }
    const detach = new this.vido.Detach(() => !visible);
    const rightStyleMap = this.getRightStyleMap(item, visible);
    const leftStyleMap = this.getLeftStyleMap(item, visible);
    const onLeftPointerDown = {
      handleEvent: (ev) => this.onLeftPointerDown(ev),
      //capture: true,
    };
    const onRightPointerDown = {
      handleEvent: (ev) => this.onRightPointerDown(ev),
      //capture: true,
    };
    return this
      .html`${oldContent}<div detach=${detach} class=${this.rightClassName} style=${rightStyleMap} @pointerdown=${onRightPointerDown}>${this.data.content}</div>`;
    /*
    return this
      .html`${oldContent}<div detach=${detach} class=${this.leftClassName} style=${leftStyleMap} @pointerdown=${onLeftPointerDown}>${this.data.content}</div><div detach=${detach} class=${this.rightClassName} style=${rightStyleMap} @pointerdown=${onRightPointerDown}>${this.data.content}</div>`;
      */
  }

  public getWrapper(oldWrapper: Wrapper): Wrapper {
    if (!this.oldWrapper) {
      this.oldWrapper = oldWrapper;
    }
    this.initializeWrapper();
    return this.wrapper;
  }
}

export function Plugin(options: Options = {}) {
  return function initialize(vidoInstance: Vido) {
    const itemResizing = new ItemResizing(vidoInstance, options);
    vidoInstance.state.update('config.wrappers.ChartTimelineItemsRowItem', (oldWrapper) => {
      return itemResizing.getWrapper(oldWrapper);
    });
  };
}
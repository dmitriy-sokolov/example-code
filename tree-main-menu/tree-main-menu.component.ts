import { Component, ElementRef, Output, EventEmitter, Input, ChangeDetectionStrategy } from '@angular/core';
import { SelectionChange } from '@angular/cdk/collections';
import { ObjectModel } from 'src/app/module/shared/model/object-model';
import { action, observable, computed } from 'mobx-angular';
import { FlatTreeControl } from '@angular/cdk/tree';
import { UserUiSettingsService } from 'src/app/module/shared/service/user-ui-settings.service';
import { ObjectModelType } from 'src/app/module/shared/enum/object-model-type.enum';

export class TreeList {
  hidden = false;
  logicHidden = false;
  indent = 3;
  expandable = false;  
  level: number = 0;

  constructor(
    public item: ObjectModel
  ) { }
}

@Component({
  selector: 'dx-tree-main-menu',
  templateUrl: './tree-main-menu.component.html',
  styleUrls: ['./tree-main-menu.component.less'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TreeMainMenuComponent {

  treeControl: FlatTreeControl<TreeList>;
  private mustUpdateActive: boolean = false;
  private mustToNavigate: boolean = false;
  
  activeNodeId: string = null;
  @Input('activeNodeId') set setActiveNodeId(value: string) {        
    if (this.activeNodeId !== value) {
      this.activeNodeId = value;
      if (this.activeNodeId) {
        this.mustUpdateActive = true;
        this.updateActiveNode();
      }        
    }
  }

  private _navigateNodeId: string = null;
  @Input('navigateNodeId') set setNavigateNodeId(value: string) {    
    if (this._navigateNodeId !== value) {
      this._navigateNodeId = value;
      if (this._navigateNodeId) {
        this.mustToNavigate = true;
        this.updateNavigateToNode();
      }
    }
  }

  private updateNavigateToNode() {        
    if (this.cache.has(this._navigateNodeId)) {
      this.openTree(this.cache.get(this._navigateNodeId).item.parentId);
      // call after update UI
      setTimeout(this.doScroll.bind(this));  
      this.mustToNavigate = false;
    }
  }

  private updateActiveNode() {        
    if (this.cache.has(this.activeNodeId)) {
      this.openTree(this.cache.get(this.activeNodeId).item.parentId);
      // call after update UI
      setTimeout(this.doScroll.bind(this));  
      this.mustUpdateActive = false;
    }
  }
  
  @Input() 
  selectedNodeId: string = null;

  @Output() 
  selectedNode: EventEmitter<string> = new EventEmitter<string>();
  
  @Input()
  loadNodes: (nodeId: string) => void;
  
  @observable
  @Input()
  source: ObjectModel[] = [];
  
  private getLevel = (node: TreeList) => node.level;
  private isExpandable = (node: TreeList) => node.expandable;
  
  private cache: Map<string, TreeList> = new Map<string, TreeList>();
  private parentToChildIds: Map<string, Set<string>> = new Map<string, Set<string>>(); 

  constructor(    
    private uiSettings: UserUiSettingsService,
    private navigateTreeRef: ElementRef
  ) {
    this.treeControl = new FlatTreeControl<TreeList>(this.getLevel, this.isExpandable); 
    this.treeControl.expansionModel.onChange.subscribe(change => {
      if ((change as SelectionChange<TreeList>).added ||
        (change as SelectionChange<TreeList>).removed) {
        this.handleTreeControl(change as SelectionChange<TreeList>);
      }
    });    
  }

  @computed 
  get dataSource(): TreeList[] {    
    const cache = this.cache;
    this.cache = new Map<string, TreeList>();
    this.parentToChildIds = new Map<string, Set<string>>();
    const newNodes: string[] = [];    
    this.source.forEach(e => {      
      let treeList: TreeList;
      if (cache.has(e.id)) {
        treeList = cache.get(e.id);
        treeList.item = e;
      } else {
        treeList = new TreeList(e);
        newNodes.push(e.id);
      }

      this.cache.set(e.id, treeList);
      treeList.expandable = !!e.childs.length;
      
      if (!this.parentToChildIds.has(e.parentId)) {
        this.parentToChildIds.set(e.parentId, new Set<string>());
      }
      this.parentToChildIds.get(e.parentId).add(e.id);
    });
    const modelId = this.uiSettings.modelId;
    this.setLevelFromCache(modelId, 0);
    this.setHiddenForNewNodes(newNodes);

    // sort by order    
    const query:TreeList[] = [];
    this.addChildBySortOrder(modelId, query);
    if (this.mustUpdateActive) {
      this.updateActiveNode();
    }    
    if (this.mustToNavigate) {
      this.updateNavigateToNode();
    }    
    return query;
  }

  private setHiddenForNewNodes(ids: string[]) {    
    ids.forEach(id => {      
      const node = this.cache.get(id);
      const parentNode = this.cache.get(node.item.parentId);
      if (parentNode && parentNode.item.id !== this.uiSettings.modelId) {
        if (this.treeControl.isExpanded(parentNode)) {
          node.hidden = parentNode.hidden;
          node.logicHidden = false;
        } else {
          node.hidden = true;
          node.logicHidden = true;
        }  
      }
    });
  }

  private sortNodeByOrder(e1:TreeList, e2: TreeList): number {
    const order1 = e1.item.order;
    const order2 = e2.item.order;
    return order1 < order2 
      ? -1
      : (order1 === order2) ? 0 : 1;
  }

  private addChildBySortOrder(parentId: string, source: TreeList[]) {
    if (this.parentToChildIds.has(parentId))    
    {
      Array.from(this.parentToChildIds.get(parentId))
      .map(e => this.cache.get(e))
      .sort(this.sortNodeByOrder)
      .forEach(e => {
        source.push(e);
        this.addChildBySortOrder(e.item.id, source);
      });
    }
  }

  private setLevelFromCache(parentId, level) {    
    if (this.parentToChildIds.has(parentId)) {
      const elems = this.parentToChildIds.get(parentId);
      elems.forEach(e => {
        this.cache.get(e).level = level;
        this.setLevelFromCache(e, level + 1);
      });
    }    
  }

  selectNode(id: string) {
    this.selectedNodeId = id;
    this.selectedNode.emit(id);
  }

  getNameIcon(type: ObjectModelType): string {
    let res = 'files-folder';
    switch (type) {
      case ObjectModelType.ReportDocument: {
        res = 'charts-line';
        break;
      }
      case ObjectModelType.DisplayDocument: {
        res = 'charts-pie';
        break;
      }
    }
    return res;    
  }

  @action 
  toggleNode(node: TreeList, expand: boolean) {    
    if (expand) {      
      if (this.parentToChildIds.has(node.item.id) 
        && this.parentToChildIds.get(node.item.id).size === node.item.childs.length
        ) {        
        // show childs
        this.parentToChildIds.get(node.item.id).forEach(e => {
          const elem = this.cache.get(e);
          elem.hidden = false;
          elem.logicHidden = false;
          this.expandChildsAsSave(e);
        });                
      } else { 
        if (this.parentToChildIds.has(node.item.id)) {
          this.parentToChildIds.get(node.item.id).forEach(e => {this.cache.delete(e);});
        }       
        this.loadNodes(node.item.id);
      }
    } else {
      this.parentToChildIds.get(node.item.id).forEach(e => {
        const elem = this.cache.get(e);
        elem.hidden = true;
        elem.logicHidden = true;
        this.collapseChilds(e);
      });
    } 
  }

  private expandChildsAsSave(parentId: string) {
    if (this.parentToChildIds.has(parentId)) {
      this.parentToChildIds.get(parentId).forEach(e => {
        const node = this.cache.get(e);
        node.hidden = node.logicHidden;
        this.expandChildsAsSave(e);
      });
    }
  }

  private collapseChilds(parentId: string) {
    if (this.parentToChildIds.has(parentId)) {
      this.parentToChildIds.get(parentId).forEach(e => {        
        this.cache.get(e).hidden = true;
        this.collapseChilds(e);
      });
    }
  }

  private openTree(nodeId: string) {
    if (nodeId) { // model hasn't parentId
      let node = this.cache.get(nodeId);    
      const modelId = this.uiSettings.modelId;    
      while(node.item.id !== modelId) {      
        this.treeControl.expand(node);
        node = this.cache.get(node.item.parentId);      
      }  
    }
  }

  /** Handle expand/collapse behaviors */
  private handleTreeControl(change: SelectionChange<TreeList>) {
    if (change.added) {
      change.added.forEach(node => this.toggleNode(node, true));
    }
    if (change.removed) {
      change.removed.slice().reverse().forEach(node => this.toggleNode(node, false));
    }
  }

  /**
   * Скролл до показа активной ноды
   */
  private doScroll() {
    const elem = this.navigateTreeRef.nativeElement.querySelector('.active');
    if (elem)
      elem.scrollIntoView({ block: "start" });
  }

}

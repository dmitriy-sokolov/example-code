import { IObjectModelStore } from '../interface/i-object-model-store';
import { Observable, forkJoin, of } from 'rxjs';
import { PocoModel } from '../poco/model';
import { PocoObjectModel } from '../poco/object-model';
import { ValueTypesService } from 'src/app/api-clients/valueType';
import { PropertyService, PageOfProperty, PropertyPrimitivesService, PropertyConfiguration, PropertyPrimitive } from 'src/app/api-clients/objectProperty';
import { DatareferenceService } from 'src/app/api-clients/datareference';
import { ObjectsService, ModelObject, Model } from 'src/app/api-clients/object';
import { Injectable } from '@angular/core';
import { map, mergeMap } from 'rxjs/operators';
import { ObjectModelType } from '../enum/object-model-type.enum';
import { UserUiSettingsService } from '../service/user-ui-settings.service';

@Injectable()
export class ObjectModelStore implements IObjectModelStore {

    private token: string = 'dx'; // токен для авторизации
    private readonly modelId: string;

    constructor(
        private typeSrv: ValueTypesService,
        private propertySrv: PropertyService,
        private modelSrv: ObjectsService,
        private datareferenceSrv: DatareferenceService,
        private propertyPrimitiveSrv: PropertyPrimitivesService,
        uiConf: UserUiSettingsService
    ) {
        this.modelId = uiConf.modelId;
    }

    /**
     * Получение списка моделей
     */
    models(): Observable<PocoModel[]> {
        // todo: models must filter by prototype. Prototype have code 'document explorer'        
        // throw new Error("Method not implemented.");
        return this.modelSrv.getModels(this.token)
            .pipe(
                map((answer: any) => answer.content.map(this.toPocoModel))
            )
    }

    /**
     * Получение модели по идентификатору
     * @param id идентификатор модели
     */
    model(id: string): Observable<PocoModel> {        
        // throw new Error("Method not implemented.");
        return this.modelSrv.getModelById(id, this.token)
            .pipe(
                map(this.toPocoModel)
            )
    }

    object(id: string): Observable<PocoObjectModel> {        
        return this.modelSrv.getObjectById(this.modelId, id, this.token)
            .pipe(
                mergeMap(this.toPoco)
            )
    }

    objects(id: string): Observable<PocoObjectModel[]> {            
        return (id === this.modelId
        ? this.modelSrv.getObjects(id, this.token, true)
        : this.modelSrv.getObjectTree(this.modelId, id, this.token)) 
            .pipe(
                // for each object get all property
                mergeMap(os => forkJoin(os.content.map((o: ModelObject) => this.toPoco(o)))
                )
            );
    }

    findObject(filter: string): Observable<PocoObjectModel[]> {
        throw new Error("Method not implemented.");
    }

    private getPropertyValue(type: string, conf: any, codeDatareference: string): boolean | string | number {
        let res: boolean | string | number;
        if (codeDatareference === 'const') {
            switch (type) {
                case 'String':
                    res = !conf.const || conf.const === 'null' ? null : conf.const;
                    break;
                case 'Integer':
                    res = Number(conf.const);
                    break;
                case 'Boolean':
                    res = conf.const == 'true';
                    break;
                default:
                    throw new Error(`${type} type not supported`);
            }
        } else {
            throw new Error("Datareference not supported");
        }
        return res;
    }

    private toPocoModel(source: Model): PocoModel {
        return source
            ? {
                id: source.id,
                name: source.name,
                description: source.description,
                modelTypeCode: null
            }
            : null;
    }

    /**
     * преобразования типа объекста из строки в перечисление
     * @param source тип объекта как строка
     */
    private getTypeByStr(source: string): ObjectModelType {
        let result = ObjectModelType.None;
        switch (source) {
            case 'folder':
                result = ObjectModelType.Folder;
                break;
            case 'displayDocument':
                result = ObjectModelType.DisplayDocument;
                break;
            case 'reportDocument':
                result = ObjectModelType.ReportDocument;
                break;
            case 'linkedDocument':
                result = ObjectModelType.LinkedDocument;
                break;
        }
        return result;
    }

    private toPocoObject(source: ModelObject): PocoObjectModel {
        return source
            ? {
                id: source.id,
                description: source.description,
                parentId: source.parentid ? source.parentid : this.modelId,
                name: source.name,
                isHeaderMenuItem: false,
                isTreeMenuItem: false,
                order: 0,
                type: ObjectModelType.None,
                url: null
            }
            : null;
    }

    /**
     * Получение параметров объектов модели из микросервисов
     * @param source объект модели
     */
    private toPoco(source: ModelObject): Observable<PocoObjectModel> {
        return this.propertySrv.getProperties(this.token, source.id, true, 0)
            .pipe(
                mergeMap(
                    (ps: PageOfProperty) =>
                        forkJoin(
                            ps.content.map(
                                p => forkJoin(
                                    // получение конфигураций
                                    this.propertySrv.getPropertiesConfiguration(p.id, this.token)
                                        .pipe(
                                            mergeMap(
                                                (pp: PropertyConfiguration) =>     
                                                // получение параметра свойства                                            
                                                this.datareferenceSrv.getDatareference(pp.datareferenceId, this.token)
                                                    .pipe(
                                                        map(dr => <any>{
                                                            conf: pp.configuration,
                                                            code: dr.code
                                                        })
                                                    )
                                            )
                                        ),
                                    // получение описание свойства
                                    this.propertyPrimitiveSrv.getPropertyPrimitive(p.propertyPrimitiveId, this.token)
                                        .pipe(
                                            mergeMap(
                                                // получение типа значения свойства
                                                (pp: PropertyPrimitive) => this.typeSrv.getValueType(pp.valueTypeId, this.token)
                                                    .pipe(
                                                        map(a => <any>{
                                                            name: pp.code,
                                                            type: a.code
                                                        })
                                                    )
                                            )
                                        )
                                )
                                .pipe(
                                    map(answer => <any>{
                                        id: p.id,
                                        name: answer[1].name,
                                        value: this.getPropertyValue(answer[1].type, answer[0].conf, answer[0].code) // получение преобразованного значения свойства 
                                    })
                                )
                            )
                        )
                ),
                map(ps => {
                    // инициализация только нужных свойств
                    let res = this.toPocoObject(source);
                    ps.forEach(p => {
                        switch (p.name) {
                            case 'documentType':
                                res.type = this.getTypeByStr(p.value);
                                break;
                            case 'url':
                                res.url = p.value;
                                break;
                            case 'order':
                                res.order = p.value;
                                break;
                            case 'treeMenuItem':
                                res.isTreeMenuItem = p.value;
                                break;
                            case 'headerMenuItem':
                                res.isHeaderMenuItem = p.value;
                                break;
                        }
                    })                    
                    return res;
                })
            )
    }
}
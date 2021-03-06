"use strict";
if (!this.isUnitTest) {

let args = new URLSearchParams(location.search.slice(1));
sfHost = args.get("host");
initButton(true);
chrome.runtime.sendMessage({message: "getSession", sfHost}, message => {
  session = message;

  let objectData = ko.observable(null);
  let recordData = ko.observable(null);
  let layoutInfo = ko.observable(null);
  let isDragging = false;

  let vm = {
    sfLink: "https://" + sfHost,
    spinnerCount: ko.observable(0),
    recordHeading() {
      if (recordData()) {
        return "(" + recordData().Name + " / " + recordData().Id + ")";
      }
      if (objectData()) {
        return"(" + objectData().label + " / " + objectData().keyPrefix + ")";
      }
      return "Loading all data...";
    },
    sobjectName: ko.observable(),
    objectName() {
      // Get with correct case if available, otherwise just return the input.
      return objectData() ? objectData().name : vm.sobjectName();
    },
    title() {
      return (objectData() ? "ALL DATA: " + objectData().name + " " : "") + vm.recordHeading();
    },
    errorMessages: ko.observableArray(),
    rowsFilterFocus: ko.observable(true),
    rowsFilter: ko.observable(""),
    fieldRows: ko.observableArray(),
    childRows: ko.observableArray(),
    clearAndFocusFilter() {
      vm.rowsFilter("");
      vm.rowsFilterFocus(true);
    },
    sortFieldsByName() {
      fieldRowList.sortRows("name");
    },
    sortFieldsByLabel() {
      fieldRowList.sortRows("label");
    },
    sortFieldsByHelptext() {
      fieldRowList.sortRows("helptext");
    },
    sortFieldsByDesc() {
      fieldRowList.sortRows("desc");
    },
    sortFieldsByValue() {
      fieldRowList.sortRows("dataValue");
    },
    sortFieldsByType() {
      fieldRowList.sortRows("type");
    },
    sortChildsByName() {
      childRowList.sortRows("name");
    },
    sortChildsByObject() {
      childRowList.sortRows("object");
    },
    sortChildsByField() {
      childRowList.sortRows("field");
    },
    sortChildsByLabel() {
      childRowList.sortRows("label");
    },
    detailsFilterFocus: ko.observable(false),
    detailsFilter: ko.observable(""),
    detailsBox: ko.observable(null),
    isEditing: ko.observable(false),
    hasEntityParticles: ko.observable(false),
    showFieldLabelColumn: ko.observable(true),
    showFieldHelptextColumn: ko.observable(false),
    showFieldDescriptionColumn: ko.observable(false),
    showFieldValueColumn: ko.observable(false),
    showFieldTypeColumn: ko.observable(true),
    closeDetailsBox() {
      vm.detailsBox(null);
    },
    showObjectMetadata() {
      let objectDescribe = objectData();
      let props = {};
      addProperties(props, objectDescribe, "desc.", {fields: true, childRelationships: true});
      addProperties(props, layoutInfo(), "layout.", {detailLayoutSections: true, editLayoutSections: true, relatedLists: true});
      showAllFieldMetadata(objectDescribe.name, props, false);
    },
    detailsFilterClick(field) {
      vm.closeDetailsBox();
      vm.rowsFilter(field.key + "=" + JSON.stringify(field.value));
    },
    tableMouseDown() {
      isDragging = false;
      return true;
    },
    tableMouseMove(_, e) {
      if (e.movementX || e.movementY) {
        isDragging = true;
      }
      return true;
    },
    tableClick(_, e) {
      if (!e.target.closest("a, textarea") && !isDragging) {
        let td = e.target.closest(".quick-select");
        getSelection().selectAllChildren(td.firstElementChild || td);
      }
      return true;
    },
    canEdit() {
      return objectData() && objectData().updateable && recordData() && recordData().Id;
    },
    doEdit() {
      for (let fieldRow of vm.fieldRows()) {
        if (fieldRow.canEdit()) {
          fieldRow.dataEditValue(fieldRow.dataStringValue());
        }
      }
      vm.isEditing(true);
    },
    doSave() {
      vm.errorMessages.remove(e => e.startsWith("Error saving record:"));
      let record = {};
      vm.fieldRows().forEach(fieldRow => fieldRow.saveDataValue(record));
      let recordUrl = objectData().urls.rowTemplate.replace("{ID}", recordData().Id);
      spinFor(
        "saving record",
        askSalesforce(recordUrl, null, {method: "PATCH", body: record})
          .then(() => {
            clearRecordData();
            setRecordData(askSalesforce(recordUrl));
          })
      );
    },
    cancelEdit() {
      vm.errorMessages.remove(e => e.startsWith("Error saving record:"));
      for (let fieldRow of vm.fieldRows()) {
        fieldRow.dataEditValue(null);
      }
      vm.isEditing(false);
    },
    canView() {
      return recordData() && recordData().Id;
    },
    viewLink() {
      return recordData() && recordData().Id && "https://" + sfHost + "/" + recordData().Id;
    },
    openSetup() {
      let args = new URLSearchParams();
      args.set("host", sfHost);
      args.set("object", vm.objectName());
      return "open-object-setup.html?" + args;
    },
  };

  let fetchFieldDescriptions = vm.showFieldDescriptionColumn.subscribe(() => {
    fetchFieldDescriptions.dispose();
    vm.fieldRows().forEach(fieldRow => fieldRow.showFieldDescription());
  });

  function RowList(rows, constructor) {
    let map = new Map();
    let sortCol = "name";
    let sortDir = 1;
    let list = {
      getRow(name) {
        if (!name) { // related lists may not have a name
          let row = new constructor(name);
          rows.push(row);
          return row;
        }
        let row = map.get(name);
        if (!row) {
          row = new constructor(name);
          rows.push(row);
          map.set(name, row);
        }
        return row;
      },
      sortRows(col) {
        sortDir = col == sortCol ? -sortDir : 1;
        sortCol = col;
        list.resortRows();
      },
      resortRows() {
        rows.sort((a, b) => sortDir * a.sortKeys[sortCol]().localeCompare(b.sortKeys[sortCol]()));
      }
    };
    return list;
  }

  var fieldRowList = new RowList(vm.fieldRows, FieldRow);

  function FieldRow(fieldName) {
    function fieldProperties() {
      let props = {};
      if (typeof fieldVm.dataTypedValue() != "undefined") {
        addProperties(props, {dataValue: fieldVm.dataTypedValue()}, "", {});
      }
      if (fieldVm.fieldDescribe()) {
      addProperties(props, fieldVm.fieldDescribe(), "desc.", {});
      }
      if (fieldVm.entityParticle()) {
        addProperties(props, fieldVm.entityParticle(), "part.", {});
      }
      if (fieldVm.fieldParticleMetadata()) {
        addProperties(props, fieldVm.fieldParticleMetadata(), "meta.", {});
      }
      if (fieldVm.detailLayoutInfo()) {
        addProperties(props, fieldVm.detailLayoutInfo().indexes, "layout.", {});
        addProperties(props, fieldVm.detailLayoutInfo().section, "layoutSection.", {layoutRows: true});
        addProperties(props, fieldVm.detailLayoutInfo().row, "layoutRow.", {layoutItems: true});
        addProperties(props, fieldVm.detailLayoutInfo().item, "layoutItem.", {layoutComponents: true});
        addProperties(props, fieldVm.detailLayoutInfo().component, "layoutComponent.", {details: true});
      } else if (layoutInfo()) {
        addProperties(props, {shownOnLayout: false}, "layout.", {});
      }
      if (fieldVm.editLayoutInfo()) {
        addProperties(props, fieldVm.editLayoutInfo().indexes, "editLayout.", {});
        addProperties(props, fieldVm.editLayoutInfo().section, "editLayoutSection.", {layoutRows: true});
        addProperties(props, fieldVm.editLayoutInfo().row, "editLayoutRow.", {layoutItems: true});
        addProperties(props, fieldVm.editLayoutInfo().item, "editLayoutItem.", {layoutComponents: true});
        addProperties(props, fieldVm.editLayoutInfo().component, "editLayoutComponent.", {details: true});
      } else if (layoutInfo()) {
        addProperties(props, {shownOnLayout: false}, "editLayout.", {});
      }
      return props;
    }

    let fieldVm = {
      fieldDescribe: ko.observable(),
      dataTypedValue: ko.observable(),
      dataEditValue: ko.observable(null),
      detailLayoutInfo: ko.observable(),
      editLayoutInfo: ko.observable(),
      hasFocus: ko.observable(false),
      entityParticle: ko.observable(),
      fieldParticleMetadata: ko.observable(),

      dataStringValue() {
        return fieldVm.dataTypedValue() == null ? "" : "" + fieldVm.dataTypedValue();
      },
      fieldLabel() {
        if (fieldVm.fieldDescribe()) {
          return fieldVm.fieldDescribe().label;
        }
        if (fieldVm.entityParticle()) {
          return fieldVm.entityParticle().Label;
        }
        return "Unknown Label";
      },
      fieldName: fieldName,
      hasFieldHelptext() {
        return typeof fieldVm.fieldHelptext() != "undefined";
      },
      fieldHelptext() {
        return fieldVm.fieldDescribe() && fieldVm.fieldDescribe().inlineHelpText;
      },
      hasFieldDesc() {
        return typeof fieldVm.fieldDesc() != "undefined";
      },
      fieldDesc() {
        return fieldVm.fieldParticleMetadata() && fieldVm.fieldParticleMetadata().Metadata.description;
      },
      fieldTypeDesc() {
        let fieldDescribe = fieldVm.fieldDescribe();
        if (fieldDescribe) {
          return fieldDescribe.type == "reference"
          ? "[" + fieldDescribe.referenceTo.join(", ") + "]"
          : (fieldDescribe.type || "")
            + (fieldDescribe.length ? " (" + fieldDescribe.length + ")" : "")
            + (fieldDescribe.precision || fieldDescribe.scale ? " (" + fieldDescribe.precision + ", " + fieldDescribe.scale + ")" : "")
            + (fieldDescribe.calculated ? "*" : "");
        }
        let particle = fieldVm.entityParticle();
        if (particle) {
          return particle.DataType == "reference" && particle.FieldDefinition.ReferenceTo.referenceTo
          ? "[" + particle.FieldDefinition.ReferenceTo.referenceTo.join(", ") + "]"
          : (particle.DataType || "")
            + (particle.Length ? " (" + particle.Length + ")" : "")
            + (particle.Precision || particle.Scale ? " (" + particle.Precision + ", " + particle.Scale + ")" : "")
            + (particle.IsCalculated ? "*" : "");
        }
        return "(Unknown)";
      },
      referenceTypes() {
        let fieldDescribe = fieldVm.fieldDescribe();
        if (fieldDescribe) {
          return fieldDescribe.type == "reference" ? fieldDescribe.referenceTo : null;
        }
        let particle = fieldVm.entityParticle();
        if (particle) {
          return particle.DataType == "reference" ? particle.FieldDefinition.ReferenceTo.referenceTo : null;
        }
        return [];
      },
      fieldIsCalculated() {
        if (fieldVm.fieldDescribe()) {
          return fieldVm.fieldDescribe().calculated;
        }
        if (fieldVm.entityParticle()) {
          return fieldVm.entityParticle().IsCalculated;
        }
        return false;
      },
      fieldIsHidden() {
        return !fieldVm.fieldDescribe();
      },
      hasDataValue() {
        return typeof fieldVm.dataTypedValue() != "undefined";
      },
      hasBlankValue() {
        return fieldVm.dataTypedValue() === null;
      },
      openSetup() {
        let args = new URLSearchParams();
        args.set("host", sfHost);
        args.set("object", vm.objectName());
        args.set("field", fieldName);
        return "open-field-setup.html?" + args;
      },
      summary() {
        let fieldDescribe = fieldVm.fieldDescribe();
        if (fieldDescribe) {
          return fieldName + "\n"
            + (fieldDescribe.calculatedFormula ? "Formula: " + fieldDescribe.calculatedFormula + "\n" : "")
            + (fieldDescribe.inlineHelpText ? "Help text: " + fieldDescribe.inlineHelpText + "\n" : "")
            + (fieldDescribe.picklistValues && fieldDescribe.picklistValues.length > 0 ? "Picklist values: " + fieldDescribe.picklistValues.map(pickval => pickval.value).join(", ") + "\n" : "")
            ;
        }
        // Entity particle does not contain any of this information
        return fieldName + "\n(Details not available)";
      },
      isEditing() {
        return typeof fieldVm.dataEditValue() == "string";
      },
      canEdit() {
        return fieldVm.fieldDescribe() && fieldVm.fieldDescribe().updateable;
      },
      tryEdit() {
        if (!fieldVm.isEditing() && vm.canEdit() && fieldVm.canEdit()) {
          fieldVm.dataEditValue(fieldVm.dataStringValue());
          fieldVm.hasFocus(true);
          vm.isEditing(true);
        }
      },
      cancelEdit() {
        fieldVm.dataEditValue(null);
      },
      saveDataValue(recordData) {
        if (fieldVm.isEditing()) {
          recordData[fieldVm.fieldDescribe().name] = fieldVm.dataEditValue() == "" ? null : fieldVm.dataEditValue();
        }
      },
      isId() {
        if (fieldVm.fieldDescribe()) {
          return fieldVm.fieldDescribe().type == "reference" && !!fieldVm.dataTypedValue();
        }
        if (fieldVm.entityParticle()) {
          return fieldVm.entityParticle().DataType == "reference" && !!fieldVm.dataTypedValue();
        }
        return false;
      },
      openDetails() {
        showAllFieldMetadata(fieldName, fieldProperties(), true);
      },
      showRecordIdUrl() {
        let args = new URLSearchParams();
        args.set("host", sfHost);
        args.set("q", fieldVm.dataTypedValue());
        return "inspect.html?" + args;
      },
      showReferenceUrl(type) {
        let args = new URLSearchParams();
        args.set("host", sfHost);
        args.set("q", type);
        return "inspect.html?" + args;
      },
      sortKeys: {
        name: () => fieldVm.fieldName.trim(),
        label: () => fieldVm.fieldLabel().trim(),
        helptext: () => (fieldVm.fieldHelptext() || "").trim(),
        desc: () => (fieldVm.fieldDesc() || "").trim(),
        dataValue: () => fieldVm.hasDataValue() ? fieldVm.dataStringValue().trim() : "\uFFFD",
        type: () => fieldVm.fieldTypeDesc().trim()
      },
      visible() {
        let values = vm.rowsFilter().trim().split(/[ \t]+/);
        return values.every(value => {
          let pair = value.split("=");
          if (pair.length == 2) {
            try {
              return fieldProperties()[pair[0]] === JSON.parse(pair[1]);
            } catch(e) {
              return false;
            }
          } else {
            let row = fieldVm.fieldName
              + "," + (vm.showFieldLabelColumn() ? fieldVm.fieldLabel() : "")
              + "," + (vm.showFieldHelptextColumn() ? fieldVm.fieldHelptext() || "" : "")
              + "," + (vm.showFieldDescriptionColumn() ? fieldVm.fieldDesc() || "" : "")
              + "," + (vm.showFieldValueColumn() ? fieldVm.dataStringValue() : "")
              + "," + (vm.showFieldTypeColumn() ? fieldVm.fieldTypeDesc() : "");
            return row.toLowerCase().indexOf(value.toLowerCase()) != -1;
          }
        });
      },
      showFieldDescription() {
        if (!fieldVm.entityParticle()) {
          return;
        }
        spinFor("getting field definition metadata for " + fieldName, askSalesforce("/services/data/v" + apiVersion + "/tooling/query/?q=" + encodeURIComponent("select Metadata from FieldDefinition where DurableId = '" + fieldVm.entityParticle().FieldDefinition.DurableId + "'"))
          .then(fieldDefs => {
            fieldVm.fieldParticleMetadata(fieldDefs.records[0]);
          }));
      }
    };
    return fieldVm;
  }

  var childRowList = new RowList(vm.childRows, ChildRow);
  
  function ChildRow(childName) {
    function childProperties() {
      let props = {};
      if (childVm.childDescribe()) {
        addProperties(props, childVm.childDescribe(), "child.", {});
      }
      if (childVm.relatedListInfo()) {
        addProperties(props, childVm.relatedListInfo(), "layout.", {});
      } else if (layoutInfo()) {
        addProperties(props, {shownOnLayout: false}, "layout.", {});
      }
      return props;
    }

    let childVm = {
      childDescribe: ko.observable(),
      relatedListInfo: ko.observable(),
      childName: childName,
      childObject() {
        if (childVm.childDescribe()) {
          return childVm.childDescribe().childSObject;
        }
        if (childVm.relatedListInfo()) {
          return childVm.relatedListInfo().relatedList.sobject;
        }
        return "(Unknown)";
      },
      childField() {
        if (childVm.childDescribe()) {
          return childVm.childDescribe().field;
        }
        if (childVm.relatedListInfo()) {
          return childVm.relatedListInfo().relatedList.field;
        }
        return "(Unknown)";
      },
      childLabel() {
        if (childVm.relatedListInfo()) {
          return childVm.relatedListInfo().relatedList.label;
        }
        return "";
      },
      sortKeys: {
        name: () => (childVm.childName || "").trim(),
        object: () => (childVm.childObject() || "").trim(),
        field: () => (childVm.childField() || "").trim(),
        label: () => (childVm.childLabel() || "").trim()
      },
      visible() {
        let values = vm.rowsFilter().trim().split(/[ \t]+/);
        return values.every(value => {
          let pair = value.split("=");
          if (pair.length == 2) {
            try {
              return childProperties()[pair[0]] === JSON.parse(pair[1]);
            } catch(e) {
              return false;
            }
          } else {
            let row = childVm.childName + "," + childVm.childObject() + "," + childVm.childField() + "," + childVm.childLabel();
            return row.toLowerCase().indexOf(value.toLowerCase()) != -1;
          }
        });
      },
      openDetails() {
        showAllFieldMetadata(childName, childProperties(), true);
      },
      showChildObjectUrl() {
        let childDescribe = childVm.childDescribe();
        if (childDescribe) {
          let args = new URLSearchParams();
          args.set("host", sfHost);
          args.set("q", childDescribe.childSObject);
          return "inspect.html?" + args;
        }
        return "";
      },
      openSetup() {
        let childDescribe = childVm.childDescribe();
        if (childDescribe) {
          let args = new URLSearchParams();
          args.set("host", sfHost);
          args.set("object", childDescribe.childSObject);
          args.set("field", childDescribe.field);
          return "open-field-setup.html?" + args;
        }
        let relatedListInfo = childVm.relatedListInfo();
        if (relatedListInfo) {
          let args = new URLSearchParams();
          args.set("host", sfHost);
          args.set("object", relatedListInfo.relatedList.sobject);
          args.set("field", relatedListInfo.relatedList.field);
          return "open-field-setup.html?" + args;
        }
        return "open-field-setup.html";
      },
      queryListUrl() {
        if (!recordData() || !recordData().Id) {
          return "";
        }
        function dataExportUrl(query) {
          let args = new URLSearchParams();
          args.set("host", sfHost);
          args.set("query", query);
          return "data-export.html?" + args;
        }
        let relatedListInfo = childVm.relatedListInfo();
        if (relatedListInfo) {
          return dataExportUrl("select Id, " + relatedListInfo.relatedList.columns.map(c => c.name).join(", ") + " from " + relatedListInfo.relatedList.sobject + " where " + relatedListInfo.relatedList.field + " = '" + recordData().Id + "'");
        }
        let childDescribe = childVm.childDescribe();
        if (childDescribe) {
          return dataExportUrl("select Id from " + childDescribe.childSObject + " where " + childDescribe.field + " = '" + recordData().Id + "'");
        }
        return "";
      }
    };
    return childVm;
  }

  function addProperties(map, object, prefix, ignore) {
    for (let key in object) {
      let value = object[key];
      if (ignore[key]) {
      } else if (value && typeof value == "object") {
        addProperties(map, value, prefix + key + ".", {});
      } else {
        map[prefix + key] = value;
      }
    }
  }
  function showAllFieldMetadata(name, allFieldMetadata, showFilterButton) {
    let fieldDetailVms = [];
    for (let key in allFieldMetadata) {
      let value = allFieldMetadata[key];
      let row = key + "," + value;
      fieldDetailVms.push({
        key,
        value,
        isString: typeof value == "string",
        isNumber: typeof value == "number",
        isBoolean: typeof value == "boolean",
        visible() {
          let value = vm.detailsFilter().trim().toLowerCase();
          return !value || row.toLowerCase().indexOf(value) != -1;
        }
      });
    }
    vm.detailsBox({rows: fieldDetailVms, name: name, showFilterButton: showFilterButton});
    vm.detailsFilterFocus(true);
  }

  ko.applyBindings(vm, document.documentElement);

  function setRecordData(recordDataPromise) {
    spinFor("retrieving record", recordDataPromise.then(res => {
      for (let name in res) {
        if (name != "attributes") {
          fieldRowList.getRow(name).dataTypedValue(res[name]);
        }
      }
      fieldRowList.resortRows();
      recordData(res);
      vm.showFieldValueColumn(true);
      spinFor(
        "describing layout",
        sobjectDescribePromise.then(sobjectDescribe => {
          if (sobjectDescribe.urls.layouts) {
            return askSalesforce(sobjectDescribe.urls.layouts + "/" + (res.RecordTypeId || "012000000000000AAA")).then(layoutDescribe => {
              for (let layoutType of [{sections: "detailLayoutSections", observable: "detailLayoutInfo"}, {sections: "editLayoutSections", observable: "editLayoutInfo"}]) {
                layoutDescribe[layoutType.sections].forEach((section, sectionIndex) => {
                  section.layoutRows.forEach((row, rowIndex) => {
                    row.layoutItems.forEach((item, itemIndex) => {
                      item.layoutComponents.forEach((component, componentIndex) => {
                        if (component.type == "Field") {
                          fieldRowList.getRow(component.value)[layoutType.observable]({
                            indexes: {
                              shownOnLayout: true,
                              sectionIndex,
                              rowIndex,
                              itemIndex,
                              componentIndex
                            },
                            section,
                            row,
                            item,
                            component
                          });
                        }
                      });
                    });
                  });
                });
              }
              fieldRowList.resortRows();
              layoutDescribe.relatedLists.forEach((child, childIndex) => {
                childRowList.getRow(child.name).relatedListInfo({
                  shownOnLayout: true,
                  relatedListIndex: childIndex,
                  relatedList: child
                });
              });
              childRowList.resortRows();
              layoutInfo(layoutDescribe);
            });
          }
        })
      );
    }));
  }
  function clearRecordData() {
    for (let fieldRow of vm.fieldRows()) {
      fieldRow.dataTypedValue(undefined);
      fieldRow.dataEditValue(null);
      fieldRow.detailLayoutInfo(undefined);
      fieldRow.editLayoutInfo(undefined);
    }
    for (let childRow of vm.childRows()) {
      childRow.relatedListInfo(undefined);
    }
    vm.isEditing(false);
    recordData(null);
    layoutInfo(null);
  }

  function spinFor(actionName, promise) {
    vm.spinnerCount(vm.spinnerCount() + 1);
    promise
      .catch(err => {
        console.error(err);
        vm.errorMessages.push("Error " + actionName + ": " + ((err && err.askSalesforceError) || err));
      })
      .then(stopSpinner, stopSpinner);
  }
  function stopSpinner() {
    vm.spinnerCount(vm.spinnerCount() - 1);
  }

  let sobjectInfoPromise;
  var sobjectDescribePromise;
  var recordDataPromise;
  if (args.has("q")) {
    let recordId = args.get("q");
    sobjectInfoPromise = Promise
      .all([
        askSalesforce("/services/data/v" + apiVersion + "/sobjects/"),
        askSalesforce("/services/data/v" + apiVersion + "/tooling/sobjects/")
      ])
      .then(responses => {
        let currentObjKeyPrefix = recordId.substring(0, 3);
        for (let generalMetadataResponse of responses) {
          let sobject = generalMetadataResponse.sobjects.find(sobject => sobject.keyPrefix == currentObjKeyPrefix || sobject.name.toLowerCase() == recordId.toLowerCase());
          if (sobject) {
            vm.sobjectName(sobject.name);
            sobjectDescribePromise = askSalesforce(sobject.urls.describe);
            if (recordId.length < 15) {
              recordDataPromise = null; // Just a prefix, don't attempt to load the record
            } else if (sobject.name.toLowerCase() == recordId.toLowerCase()) {
              recordDataPromise = null; // Not a record ID, don't attempt to load the record
            } else if (!sobject.retrieveable) {
              recordDataPromise = null;
              vm.errorMessages.push("This object does not support showing all data");
            } else {
              recordDataPromise = askSalesforce(sobject.urls.rowTemplate.replace("{ID}", recordId));
            }
            return;
          }
        }
        throw 'Unknown salesforce object: ' + recordId;
      });
  } else if (args.has("objectType")) {
    sobjectInfoPromise = Promise.resolve().then(() => {
      vm.sobjectName(args.get("objectType"));
      sobjectDescribePromise = askSalesforce("/services/data/v" + apiVersion + "/" + (args.has("useToolingApi") ? "tooling/" : "") + "sobjects/" + args.get("objectType") + "/describe/");
      if (!args.get("recordUrl")) {
        recordDataPromise = null; // No record url
      } else {
        recordDataPromise = askSalesforce(args.get("recordUrl"));
      }
    });
  } else {
    sobjectInfoPromise = Promise.reject("unknown input for showAllData");
  }
  spinFor("describing global", sobjectInfoPromise.then(() => {

    // Fetch object data using object describe call
    spinFor("describing object", sobjectDescribePromise.then(sobjectDescribe => {
      // Display the retrieved object data
      objectData(sobjectDescribe);
      for (let fieldDescribe of sobjectDescribe.fields) {
        fieldRowList.getRow(fieldDescribe.name).fieldDescribe(fieldDescribe);
      }
      fieldRowList.resortRows();
      for (let childDescribe of sobjectDescribe.childRelationships) {
        childRowList.getRow(childDescribe.relationshipName).childDescribe(childDescribe);
      }
      childRowList.resortRows();
    }));

    // Fetch record data using record retrieve call
    if (recordDataPromise) {
      setRecordData(recordDataPromise);
    }

    // Fetch fields using a Tooling API call, which returns fields not readable by the current user, but fails if the user does not have access to the Tooling API.
    // The Tooling API is not very stable. It often gives "An unexpected error occurred. Please include this ErrorId if you contact support".
    // We would like to query all meta-fields, to show them when the user clicks a field for more details.
    // But, the more meta-fields we query, the more likely the query is to fail, and the meta-fields that cause failure vary depending on the entity we query, the org we are in, and the current Salesforce release.
    // Therefore qe query the minimum set of meta-fields needed by our main UI.
    spinFor("querying tooling particles", askSalesforce("/services/data/v" + apiVersion + "/tooling/query/?q=" + encodeURIComponent("select QualifiedApiName, Label, DataType, FieldDefinition.ReferenceTo, Length, Precision, Scale, IsCalculated, FieldDefinition.DurableId from EntityParticle where EntityDefinition.QualifiedApiName = '" + vm.sobjectName() + "'"))
      .then(res => {
        for (let entityParticle of res.records) {
          fieldRowList.getRow(entityParticle.QualifiedApiName).entityParticle(entityParticle);
        }
        vm.hasEntityParticles(true);
        fieldRowList.resortRows();
      }));

  }));

});

}

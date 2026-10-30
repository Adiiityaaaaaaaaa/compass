import React from 'react';
import HadronDocument from 'hadron-document';
import { Int32, ObjectId } from 'bson';
import { expect } from 'chai';
import sinon from 'sinon';
import {
  render,
  cleanup,
  fireEvent,
  screen,
  waitFor,
} from '@mongodb-js/testing-library-compass';

import DocumentTableView from './document-table-view';

describe('<DocumentTableView />', function () {
  afterEach(cleanup);

  describe('#render', function () {
    context('when the documents have objects for ids', function () {
      it('renders the document table view with AG-Grid', async function () {
        const docs = [{ _id: '6909a21e9e548506e786c1e5', name: 'test-1' }];
        const hadronDocs = docs.map((doc) => new HadronDocument(doc));

        render(
          <DocumentTableView
            docs={hadronDocs}
            ns={'database.collection'}
            namespace={'database.collection'}
            pathChanged={sinon.spy()}
            table={{
              doc: null,
              editParams: null,
              path: [],
              types: [],
            }}
            store={{
              gridStore: {
                listen: sinon.spy(),
              },
            }}
            resetColumns={sinon.spy()}
            columnWidths={{
              name: 1337,
            }}
            onColumnWidthChange={sinon.spy()}
            start={1}
          />
        );

        // The AG-Grid wrapper should be rendered
        expect(document.querySelector('.ag-root-wrapper')).to.exist;

        // Wait for AG-Grid to fully render and display the data
        await waitFor(() => {
          // Check that the grid body is present
          expect(document.querySelector('.ag-body-viewport')).to.exist;
        });

        // Validate that the columnWidths prop was applied:
        // - the 'name' column should have the configured width
        // - the '_id' column should not share that explicit width (keeps default)
        await waitFor(() => {
          const nameHeader = document.querySelector(
            '.ag-header-cell[col-id="name"]'
          ) as HTMLElement | null;
          const idHeader = document.querySelector(
            '.ag-header-cell[col-id="_id"]'
          ) as HTMLElement | null;
          expect(nameHeader, 'name column header should exist').to.exist;
          expect(idHeader, '_id column header should exist').to.exist;
          expect(nameHeader?.style.width).to.equal('1337px');
          expect(idHeader?.style.width).to.not.equal('1337px');
        });
      });

      it('renders the breadcrumb component', function () {
        const docs = [{ _id: '6909a21e9e548506e786c1e5', name: 'test-1' }];
        const hadronDocs = docs.map((doc) => new HadronDocument(doc));

        render(
          <DocumentTableView
            docs={hadronDocs}
            ns={'database.collection'}
            namespace={'database.collection'}
            pathChanged={sinon.spy()}
            table={{
              doc: null,
              editParams: null,
              path: [],
              types: [],
            }}
            store={{
              gridStore: {
                listen: sinon.spy(),
              },
            }}
            resetColumns={sinon.spy()}
            columnWidths={{}}
            onColumnWidthChange={sinon.spy()}
            start={1}
          />
        );

        // The breadcrumb should show the collection name
        expect(screen.getByText('collection')).to.exist;
      });
    });
  });

  describe('selecting and copying cells', function () {
    const docs = [
      {
        _id: new ObjectId('6aa58011e0a9d9da5c3b1f2e'),
        age: new Int32(25),
        city: 'Bangalore',
        email: 'alice@example.com',
      },
      { _id: new ObjectId('68cc12345678901234567890') },
      {
        _id: new ObjectId('6aa58011e0a9d9da5c3b1f2f'),
        age: new Int32(35),
        city: 'Pune',
        email: 'bob@example.com',
      },
    ];

    async function renderTable() {
      render(
        <DocumentTableView
          docs={docs.map((doc) => new HadronDocument(doc))}
          ns={'database.collection'}
          namespace={'database.collection'}
          pathChanged={sinon.spy()}
          table={{ doc: null, editParams: null, path: [], types: [] }}
          store={{ gridStore: { listen: sinon.spy() } }}
          resetColumns={sinon.spy()}
          columnWidths={{}}
          onColumnWidthChange={sinon.spy()}
          start={1}
        />
      );
      await waitFor(() => {
        expect(cell(2, 'email')).to.exist;
      });
    }

    function cell(rowIndex: number, colId: string) {
      return document.querySelector<HTMLElement>(
        `.ag-row[row-index="${rowIndex}"] .ag-cell[col-id="${colId}"]`
      ) as HTMLElement;
    }

    // A press lands on what the cell shows, inside ag-grid's cell element.
    function press(target: HTMLElement, init: MouseEventInit = {}) {
      const shown =
        target.querySelector<HTMLElement>('[class^="table-view-cell"]') ??
        target;
      fireEvent.mouseDown(shown, { button: 0, ...init });
    }

    // ag-grid hands its events to the grid's callbacks on a later tick.
    async function moveOver(target: HTMLElement, buttons: number) {
      fireEvent.mouseOver(target, { buttons });
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    async function dragAcross(from: HTMLElement, to: HTMLElement) {
      press(from);
      await moveOver(to, 1);
      fireEvent.mouseUp(to);
    }

    function copy() {
      const clipboardData = { setData: sinon.spy() };
      const notPrevented = fireEvent.copy(cell(0, 'age'), { clipboardData });
      return {
        text: clipboardData.setData.firstCall?.args[1] as string | undefined,
        handled: !notPrevented,
      };
    }

    function selectedCellIds() {
      return [...document.querySelectorAll('.ag-cell.table-view-cell-selected')]
        .map(
          (element) =>
            `${element.closest('.ag-row')?.getAttribute('row-index') ?? ''}:${
              element.getAttribute('col-id') ?? ''
            }`
        )
        .sort();
    }

    it('copies only the column dragged down, not the cells beside it', async function () {
      await renderTable();

      await dragAcross(cell(0, 'city'), cell(2, 'city'));

      expect(selectedCellIds()).to.deep.equal(['0:city', '1:city', '2:city']);
      expect(copy()).to.deep.equal({
        text: 'Bangalore\n\nPune',
        handled: true,
      });
    });

    it('copies a block dragged across columns as rows of tab separated cells', async function () {
      await renderTable();

      await dragAcross(cell(2, 'email'), cell(0, 'age'));

      expect(copy().text).to.equal(
        '25\tBangalore\talice@example.com\n\t\t\n35\tPune\tbob@example.com'
      );
    });

    it('stretches the selection to a cell clicked with shift', async function () {
      await renderTable();

      press(cell(0, 'city'));
      fireEvent.mouseUp(cell(0, 'city'));
      press(cell(2, 'email'), { shiftKey: true });

      expect(copy().text).to.equal(
        'Bangalore\talice@example.com\n\t\nPune\tbob@example.com'
      );
    });

    it('stops stretching the selection once the button is let go', async function () {
      await renderTable();

      await dragAcross(cell(0, 'city'), cell(1, 'city'));
      await moveOver(cell(2, 'email'), 1);

      expect(copy().text).to.equal('Bangalore\n');
    });

    it('stops stretching the selection when the button was let go outside the window', async function () {
      await renderTable();

      press(cell(0, 'city'));
      await moveOver(cell(1, 'city'), 1);
      await moveOver(cell(2, 'email'), 0);
      await moveOver(cell(2, 'age'), 1);

      expect(copy().text).to.equal('Bangalore\n');
    });

    it('selects a whole column from its header', async function () {
      await renderTable();

      fireEvent.click(screen.getByText('email'));

      expect(copy().text).to.equal('alice@example.com\n\nbob@example.com');
    });

    it('selects whole rows from their row numbers', async function () {
      await renderTable();

      await dragAcross(cell(0, '$rowNumber'), cell(2, '$rowNumber'));

      expect(copy().text).to.equal(
        [
          '6aa58011e0a9d9da5c3b1f2e\t25\tBangalore\talice@example.com',
          '68cc12345678901234567890\t\t\t',
          '6aa58011e0a9d9da5c3b1f2f\t35\tPune\tbob@example.com',
        ].join('\n')
      );
    });

    it('copies a single cell as just its value', async function () {
      await renderTable();

      press(cell(0, '_id'));

      expect(copy().text).to.equal('6aa58011e0a9d9da5c3b1f2e');
    });

    it('leaves copying alone when nothing is selected', async function () {
      await renderTable();

      expect(copy()).to.deep.equal({ text: undefined, handled: false });
    });

    it('clears the selection on Escape', async function () {
      await renderTable();
      await dragAcross(cell(0, 'city'), cell(2, 'city'));
      expect(selectedCellIds()).to.have.lengthOf(3);

      fireEvent.keyDown(cell(2, 'city'), { key: 'Escape' });

      await waitFor(() => {
        expect(selectedCellIds()).to.deep.equal([]);
      });
      expect(copy().handled).to.equal(false);
    });

    it('drags a value by its grip instead of starting a selection', async function () {
      await renderTable();

      const grip = cell(0, 'city').querySelector<HTMLElement>(
        '[data-testid="table-view-cell-drag-grip"]'
      );
      expect(grip).to.exist;
      fireEvent.mouseDown(grip as HTMLElement, { button: 0 });

      expect(selectedCellIds()).to.deep.equal([]);
    });
  });
});

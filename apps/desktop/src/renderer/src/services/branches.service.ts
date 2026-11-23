const branchesAPI = window.retaily.branches;

export const branchesService = {
  async list() {
    return branchesAPI.list();
  },
};
